"""PyTorch models with a scikit-learn interface (used when a dataset declares `sequence_cols`)."""

from __future__ import annotations

import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin


class SequenceClassifier(ClassifierMixin, BaseEstimator):
    """Embedding + LSTM/GRU over a short categorical sequence (e.g. the crops of the previous years).

    `sequence_cols` are ordered oldest -> newest and hold integer codes; the remaining numeric columns
    are concatenated to the recurrent state before the output layer.
    """

    def __init__(self, sequence_cols: list[str], cell: str = "gru", hidden: int = 64, embedding: int = 16,
                 epochs: int = 8, batch_size: int = 2048, lr: float = 2e-3, seed: int = 42):
        self.sequence_cols = sequence_cols
        self.cell = cell
        self.hidden = hidden
        self.embedding = embedding
        self.epochs = epochs
        self.batch_size = batch_size
        self.lr = lr
        self.seed = seed

    def _split(self, X):
        seq = np.asarray(X[self.sequence_cols], dtype=np.int64) + 1  # -1 (unknown) becomes token 0
        other = [c for c in X.columns if c not in self.sequence_cols]
        static = np.asarray(X[other], dtype=np.float32) if other else np.zeros((len(X), 0), np.float32)
        return seq, static

    def fit(self, X, y):
        import torch
        from torch import nn

        torch.manual_seed(self.seed)
        self.device_ = "cuda" if torch.cuda.is_available() else "cpu"
        seq, static = self._split(X)
        self.mean_ = static.mean(axis=0) if static.shape[1] else np.zeros(0, np.float32)
        self.std_ = static.std(axis=0) + 1e-6 if static.shape[1] else np.ones(0, np.float32)
        static = (static - self.mean_) / self.std_
        self.classes_ = np.unique(y)
        n_tokens, n_classes = int(seq.max()) + 2, len(self.classes_)
        rnn_cls = nn.LSTM if self.cell == "lstm" else nn.GRU

        class Net(nn.Module):
            def __init__(inner):
                super().__init__()
                inner.embed = nn.Embedding(n_tokens, self.embedding)
                inner.rnn = rnn_cls(self.embedding, self.hidden, batch_first=True)
                inner.head = nn.Sequential(
                    nn.Linear(self.hidden + static.shape[1], self.hidden), nn.ReLU(), nn.Dropout(0.1),
                    nn.Linear(self.hidden, n_classes),
                )

            def forward(inner, tokens, extra):
                output, _ = inner.rnn(inner.embed(tokens.clamp(max=n_tokens - 1)))
                return inner.head(torch.cat([output[:, -1], extra], dim=1))

        self.net_ = Net().to(self.device_)
        tokens = torch.as_tensor(seq, device=self.device_)
        extra = torch.as_tensor(static, device=self.device_)
        target = torch.as_tensor(np.searchsorted(self.classes_, y), device=self.device_)
        optimizer = torch.optim.AdamW(self.net_.parameters(), lr=self.lr, weight_decay=1e-4)
        loss_fn = nn.CrossEntropyLoss()
        generator = torch.Generator(device="cpu").manual_seed(self.seed)
        self.net_.train()
        for _ in range(self.epochs):
            order = torch.randperm(len(target), generator=generator).to(self.device_)
            for start in range(0, len(order), self.batch_size):
                batch = order[start:start + self.batch_size]
                optimizer.zero_grad()
                loss = loss_fn(self.net_(tokens[batch], extra[batch]), target[batch])
                loss.backward()
                optimizer.step()
        return self

    def predict_proba(self, X):
        import torch

        seq, static = self._split(X)
        static = (static - self.mean_) / self.std_
        self.net_.eval()
        outputs = []
        with torch.no_grad():
            for start in range(0, len(seq), 16384):
                tokens = torch.as_tensor(seq[start:start + 16384], device=self.device_)
                extra = torch.as_tensor(static[start:start + 16384], device=self.device_)
                outputs.append(torch.softmax(self.net_(tokens, extra), dim=1).cpu().numpy())
        return np.concatenate(outputs)

    def predict(self, X):
        return self.classes_[self.predict_proba(X).argmax(axis=1)]
