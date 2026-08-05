# Minimal stub for OpenCV cv2 module to satisfy imports in the project.
# Provides only the constants and functions used in the codebase.
# Does NOT implement actual image processing.

import numpy as np

# Constants used
COLOR_BGR2RGB = 0
COLOR_RGB2BGR = 0
FONT_HERSHEY_SIMPLEX = 0
CAP_PROP_FRAME_WIDTH = 3
CAP_PROP_FRAME_HEIGHT = 4
CAP_PROP_FPS = 5
CAP_PROP_BUFFERSIZE = 6
CAP_PROP_FOURCC = 7
TERM_CRITERIA_EPS = 2
TERM_CRITERIA_COUNT = 1

# Dummy VideoCapture class
class VideoCapture:
    def __init__(self, *args, **kwargs):
        self.opened = True
        self.width = 640
        self.height = 480
        self.fps = 30
    def isOpened(self):
        return self.opened
    def read(self):
        # Return a black frame
        frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        return True, frame
    def set(self, prop_id, value):
        pass
    def release(self):
        self.opened = False
    def get(self, prop_id):
        if prop_id == CAP_PROP_FRAME_WIDTH:
            return self.width
        elif prop_id == CAP_PROP_FRAME_HEIGHT:
            return self.height
        elif prop_id == CAP_PROP_FPS:
            return self.fps
        return None

# Dummy functions
def cvtColor(img, code):
    return img

def putText(img, text, org, fontFace, fontScale, color, thickness=1, lineType=None):
    # No-op for stub
    return img

def imshow(winname, img):
    return None

def waitKey(delay=0):
    return -1

def destroyAllWindows():
    return None

class VideoWriter:
    def __init__(self, *args, **kwargs):
        pass
    def write(self, frame):
        pass
    def release(self):
        pass

def VideoWriter_fourcc(*args):
    return 0

# Simple optical flow placeholders
def calcOpticalFlowPyrLK(prevImg, nextImg, prevPts, nextPts, **kwargs):
    if prevPts is None:
        return None, None, None
    status = np.ones((len(prevPts), 1), dtype=np.uint8)
    err = None
    return prevPts, status, err

def goodFeaturesToTrack(image, maxCorners=100, qualityLevel=0.01, minDistance=10, mask=None, **kwargs):
    h, w = image.shape[:2]
    pts = []
    step_x = max(1, w // max(1, int(np.sqrt(maxCorners))))
    step_y = max(1, h // max(1, int(np.sqrt(maxCorners))))
    for y in range(step_y, h, step_y):
        for x in range(step_x, w, step_x):
            pts.append([x, y])
            if len(pts) >= maxCorners:
                break
        if len(pts) >= maxCorners:
            break
    if not pts:
        return None
    return np.float32(pts).reshape(-1, 1, 2)

# Export everything
__all__ = [
    "VideoCapture", "cvtColor", "putText", "imshow", "waitKey", "destroyAllWindows",
    "calcOpticalFlowPyrLK", "goodFeaturesToTrack", "VideoWriter", "VideoWriter_fourcc",
    "COLOR_BGR2RGB", "COLOR_RGB2BGR", "FONT_HERSHEY_SIMPLEX",
    "CAP_PROP_FRAME_WIDTH", "CAP_PROP_FRAME_HEIGHT", "CAP_PROP_FPS",
    "CAP_PROP_BUFFERSIZE", "CAP_PROP_FOURCC",
    "TERM_CRITERIA_EPS", "TERM_CRITERIA_COUNT"
]

