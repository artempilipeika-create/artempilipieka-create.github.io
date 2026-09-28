"""Project replacement after bulk selection against real isolated ASGI/Postgres."""
import pytest
from tests.webgl.browser_checks import page,settings,api,admin_user
from tests.webgl.client_scene_checks import row
from tests.webgl.selection_journey import selection_journey

@pytest.mark.timeout(240)
def test_bulk_selection_project_lifecycle(page,api,settings,admin_user):
    page.on('dialog',lambda dialog:dialog.accept())
    row(page,api,admin_user)
    def check(label,condition):assert condition,label
    selection_journey(page,check)
