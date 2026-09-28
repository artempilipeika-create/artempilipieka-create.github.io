"""Browser-only project persistence. No request handled here reaches staging."""
import json
from uuid import uuid4

class SyntheticProjects:
    def __init__(self):self.projects={};self.writes=0

    def route(self,route,path):
        base='/api/v2/3d-projects';req=route.request;method=req.method
        if path==base and method=='GET':result={'items':list(self.projects.values())}
        elif path==base and method=='POST':
            data=json.loads(req.post_data);pid=str(uuid4())
            result={**data,'project_id':pid,'version':1};self.projects[pid]=result;self.writes+=1
        elif path.startswith(base+'/') and path.removeprefix(base+'/') in self.projects:
            pid=path.removeprefix(base+'/')
            if method=='GET':result=self.projects[pid]
            elif method=='PATCH':
                result={**self.projects[pid],**json.loads(req.post_data),'version':self.projects[pid]['version']+1}
                self.projects[pid]=result;self.writes+=1
            else:return False
        else:return False
        route.fulfill(status=201 if method=='POST' else 200,content_type='application/json',body=json.dumps(result))
        return True
