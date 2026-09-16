class AfriVerifyError(Exception):
    pass


class ApiError(AfriVerifyError):
    def __init__(self, status: int, code: str, message: str, request_id: str | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.request_id = request_id

    def __repr__(self) -> str:
        return f"ApiError(status={self.status}, code={self.code!r}, message={str(self)!r})"


class WebhookSignatureError(AfriVerifyError):
    def __init__(self, message: str = "Webhook signature verification failed") -> None:
        super().__init__(message)


class ConfigurationError(AfriVerifyError):
    pass
