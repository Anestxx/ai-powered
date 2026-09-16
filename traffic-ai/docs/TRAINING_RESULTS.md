# Completed training experiments

Actual supervised fine-tuning completed locally on this laptop's CPU on
16 September 2026. The model is initialized from pretrained YOLO26n; it is not
trained from scratch. Both resulting checkpoints are saved in `models/`.

**Active default: `models/yolo26n.pt`.** The new checkpoints remain experimental
because they did not justify replacing the original for the video application.

## Mixed COCO + VisDrone run

- Checkpoint: `models/vehicles_20260916T163645Z.pt`.
- Run/report: `training-runs/vehicles_20260916T163645Z/training-report.md`.
- Terminal log: `training-runs/terminal-20260916-220642.log`.
- Four completed epochs; 512 training, 128 validation and 128 test images.
- CPU, four threads, batch 2, image size 416, AdamW initial learning rate 0.00005.
- The best checkpoint was selected by validation mAP50-95. Training plus
  evaluation took 468.6 seconds, excluding dataset preparation.
- Checkpoint SHA256:
  `4019b30227bac4e7ff5bc62d38621247d51668736b1afc8317a153359c263ee4`.
- Verified that 261 weight/bias tensors changed from the pretrained model.

| Evaluation set | Original mAP50 | Fine-tuned mAP50 | Original mAP50-95 | Fine-tuned mAP50-95 |
|---|---:|---:|---:|---:|
| Mixed validation | 0.2909 | 0.2777 | 0.2068 | 0.1934 |
| Mixed test | 0.2305 | 0.2253 | 0.1670 | 0.1588 |
| COCO test subset | 0.5051 | 0.4683 | 0.3502 | 0.3177 |
| VisDrone test subset | 0.0955 | 0.0994 | 0.0583 | 0.0573 |

The COCO test images were excluded from this fine-tuning, but belong to the
pretrained model's original benchmark. Scores apply to these small custom
subsets, not the full official datasets or BMTC roads.

The actual video pipeline processed a 12-frame synthetic pan of the packaged
bus sample and a 60-frame excerpt from `videos/road_test.mp4`. The bus appeared
in all 12 frames, but the model also labeled the same vehicle as a truck, causing
double counting. The overlapping boxes have first-frame IoU 0.975 (approximately).
The road excerpt returned zero vehicles and has no ground-truth labels.
These are software/regression checks, not additional accuracy scores.

Outputs are under `outputs/mixed-trained-positive-check/` and
`outputs/mixed-trained-road-check/`. The JSON report and
`post-training-review.json` record the decision to retain the original default.

## Earlier aerial-only run

- Checkpoint: `models/vehicles_20260916T142530Z.pt`.
- Eight epochs; 512 training, 96 validation and 96 test VisDrone images.
- Test mAP50 increased from 0.0844 to 0.1341; mAP50-95 from 0.0481 to 0.0719.
- It failed to detect the bus in the ground-level regression sample, so it was
  not activated. This prompted the mixed-data experiment above.

The two experiments use different evaluation subsets; compare each candidate
against its own baseline, not directly against the other experiment's score.

## Use and limitations

From `traffic-ai/`, inspect the experimental mixed checkpoint with:

```powershell
.venv\Scripts\python traffic_ai.py --source videos/road_test.mp4 --model models/vehicles_20260916T163645Z.pt --save-video --show
```

Omitting `--model` uses the original detector. See [TRAINING.md](TRAINING.md) to
repeat training. Local BMTC footage with bounding-box labels, road-scene negative
examples and a separate field evaluation are needed for a suitable custom model.
Traffic-level thresholds are still uncalibrated rules; this training did not
learn congestion, speed, tracking or route optimization.

All 16 Traffic AI unit tests and the dataset integrity audit passed. The backend
health endpoint also returned `status: ok` and `database: connected` after restart.
