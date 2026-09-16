import hashlib
import json
import shutil
import subprocess
import tempfile
from threading import Lock
from itertools import islice
from pathlib import Path, PureWindowsPath
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.core.config import get_settings

router = APIRouter(prefix='/api/v1/traffic', tags=['Traffic analyses'])
video_lock = Lock()


def discover_runs():
    root = get_settings().traffic_outputs_dir.resolve()
    if not root.is_dir():
        return []
    runs = []
    for file in islice(root.rglob('summary.json'), 500):
        resolved = file.resolve()
        if not resolved.is_relative_to(root) or resolved.stat().st_size > 1_000_000:
            continue
        try:
            data = json.loads(resolved.read_text(encoding='utf-8'))
            if not isinstance(data, dict) or not isinstance(data.get('frames_processed'), int):
                continue
        except (OSError, ValueError):
            continue
        relative = file.parent.relative_to(root).as_posix()
        run_id = hashlib.sha256(relative.encode()).hexdigest()[:16]
        video = file.parent / 'annotated.mp4'
        runs.append(({
            'id': run_id, 'name': relative.replace('/', ' / '),
            'frames_processed': data['frames_processed'],
            'max_visible_vehicles': data.get('max_visible_vehicles', 0),
            'traffic_level_frames': data.get('traffic_level_frames', {}),
            'source_fps': data.get('source_fps'), 'processing_fps': data.get('processing_fps'),
            'model': PureWindowsPath(str(data.get('model', 'Unknown'))).name,
            'measurement_note': data.get('measurement_note', 'Uncalibrated visible vehicle counts, not road flow or speed.'),
            'has_video': video.is_file() and video.resolve().is_relative_to(root),
        }, file.parent))
    return sorted(runs, key=lambda item: item[1].name, reverse=True)


def find_run(run_id):
    for run, folder in discover_runs():
        if run['id'] == run_id:
            return run, folder
    raise HTTPException(404, 'Analysis not found')


@router.get('/runs')
def list_runs():
    runs = [run for run, _ in discover_runs()]
    return {'items': runs, 'total': len(runs)}


@router.get('/runs/{run_id}')
def run_detail(run_id: str):
    run, folder = find_run(run_id)
    return run


@router.get('/runs/{run_id}/video')
def run_video(run_id: str):
    run, folder = find_run(run_id)
    if not run['has_video']:
        raise HTTPException(404, 'This analysis has no annotated video')
    source = folder / 'annotated.mp4'
    encoder = shutil.which('ffmpeg')
    if not encoder:
        raise HTTPException(503, 'Video playback requires FFmpeg on the API server. The Docker image includes it.')
    # OpenCV exports MPEG-4 Part 2; convert to H.264 for browser playback.
    fingerprint = f'{run_id}-{source.stat().st_size}-{source.stat().st_mtime_ns}'
    cache = Path(tempfile.gettempdir()) / 'citylens-video-cache'
    cache.mkdir(exist_ok=True)
    destination = cache / f'{fingerprint}.mp4'
    with video_lock:
        if not destination.is_file():
            temporary = cache / f'{fingerprint}.partial.mp4'
            try:
                subprocess.run([encoder, '-v', 'error', '-y', '-i', str(source), '-an',
                                '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
                                '-movflags', '+faststart', str(temporary)],
                               check=True, capture_output=True, timeout=120)
                temporary.replace(destination)
            except (subprocess.SubprocessError, OSError):
                temporary.unlink(missing_ok=True)
                raise HTTPException(503, 'Unable to prepare this recording for playback')
    return FileResponse(destination, media_type='video/mp4')
