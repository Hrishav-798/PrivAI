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


def test_select_action():
    action = Action(action="select", target="agent-select-0", value="US")
    assert action.action == "select"
    assert action.value == "US"


def test_check_and_uncheck_actions():
    check_act = Action(action="check", target="agent-checkbox-0")
    assert check_act.action == "check"
    uncheck_act = Action(action="uncheck", target="agent-checkbox-0")
    assert uncheck_act.action == "uncheck"


def test_extended_scroll_actions():
    top = Action(action="scroll_to_top")
    assert top.action == "scroll_to_top"
    bottom = Action(action="scroll_to_bottom")
    assert bottom.action == "scroll_to_bottom"
    to_el = Action(action="scroll_to_element", target="agent-btn-5")
    assert to_el.action == "scroll_to_element"
    assert to_el.target == "agent-btn-5"


def test_keyboard_actions():
    press = Action(action="press_key", key="Enter")
    assert press.action == "press_key"
    assert press.key == "Enter"
    wait_el = Action(action="wait_for_element", target="agent-btn-0")
    assert wait_el.action == "wait_for_element"
    assert wait_el.target == "agent-btn-0"


def test_extract_finish_ask_user():
    extract = Action(action="extract", target="agent-text-1")
    assert extract.action == "extract"
    finish = Action(action="finish", answer="Task complete successfully")
    assert finish.action == "finish"
    assert finish.answer == "Task complete successfully"
    ask = Action(action="ask_user", question="Do you confirm?")
    assert ask.action == "ask_user"
    assert ask.question == "Do you confirm?"


