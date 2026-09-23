"""One process entrypoint, independent of hosting provider shell-command parsing."""
import os
import uvicorn
from .app import create_app
from .config import Settings
from .security import WebPolicy
from .startup import prepare


def main():
    settings=Settings.from_env()
    policy=WebPolicy.from_env() if os.environ.get('MF_SECURITY_API','enabled')=='enabled' else None
    print('Stage 5 validating staging database and migrations',flush=True)
    prepare(settings)
    print('Stage 5 starting HTTP server; transport and dispatch disabled',flush=True)
    uvicorn.run(create_app(settings,policy),host='0.0.0.0',port=int(os.environ.get('PORT','8000')),
                access_log=False,proxy_headers=False)


if __name__=='__main__':
    main()
