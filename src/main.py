# FastAPI main entry
from fastapi import FastAPI
app = FastAPI()

@app.get('/')
def read_root():
    return {"message": "Hello from Agentic API Testing Backend"}