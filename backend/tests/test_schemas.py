"""PrivAI Backend — Tests for Action Schema Validation"""

import pytest
from pydantic import ValidationError
from app.schemas.action import Action


def test_valid_click_action():
    action = Action(action="click", target="search_button")
    assert action.action == "click"
    assert action.target == "search_button"


def test_valid_type_action():
    action = Action(action="type", target="search_input", text="Kubernetes HPA")
    assert action.action == "type"
    assert action.text == "Kubernetes HPA"


def test_valid_scroll_action():
    action = Action(action="scroll", direction="down", amount=600)
    assert action.action == "scroll"
    assert action.direction == "down"
    assert action.amount == 600


def test_valid_navigate_action():
    action = Action(action="navigate", url="https://kubernetes.io")
    assert action.action == "navigate"
    assert action.url == "https://kubernetes.io"


def test_invalid_action_type():
    with pytest.raises(ValidationError):
        Action(action="execute_js")  # Not a valid action


def test_scroll_amount_too_large():
    with pytest.raises(ValidationError):
        Action(action="scroll", direction="down", amount=10000)


def test_scroll_negative_amount():
    with pytest.raises(ValidationError):
        Action(action="scroll", direction="down", amount=-100)


def test_invalid_url_scheme():
    with pytest.raises(ValidationError):
        Action(action="navigate", url="javascript:alert(1)")


def test_invalid_scroll_direction():
    with pytest.raises(ValidationError):
        Action(action="scroll", direction="diagonal", amount=100)


def test_dangerous_text_rejected():
    with pytest.raises(ValidationError):
        Action(action="type", target="input", text="<script>alert(1)</script>")


def test_eval_text_rejected():
    with pytest.raises(ValidationError):
        Action(action="type", target="input", text="eval('malicious code')")


def test_go_back_action():
    action = Action(action="go_back")
    assert action.action == "go_back"


def test_wait_action():
    action = Action(action="wait")
    assert action.action == "wait"


def test_read_page_action():
    action = Action(action="read_page")
    assert action.action == "read_page"
