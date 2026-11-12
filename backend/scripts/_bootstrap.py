"""Make scripts runnable from anywhere: backend/ on sys.path and as cwd (.env, sqlite path)."""
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BACKEND_DIR)
sys.path.insert(0, BACKEND_DIR)
