"""Validate multipart form fields with a Pydantic model (same 422 shape as JSON bodies)."""
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError


def parse_form(model: type[BaseModel], **fields) -> BaseModel:
    try:
        return model(**fields)
    except ValidationError as exc:
        errors = []
        for err in exc.errors(include_url=False):
            err = dict(err)
            err["loc"] = ("body", *err["loc"])
            err.pop("ctx", None)  # may hold exception objects that aren't JSON-serialisable
            errors.append(err)
        raise RequestValidationError(errors)
