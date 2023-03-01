import os
import json
import torch


MODEL_NAMES = json.loads(os.environ['MODEL_NAMES'])
DEFAULT_MODEL_NAME = os.environ['DEFAULT_MODEL_NAME']

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
TORCH_DTYPE = torch.float32

STEP_TIMEOUT = 5 * 60
MAX_SESSIONS = 50  # Has effect only for API v1 (HTTP-based)
