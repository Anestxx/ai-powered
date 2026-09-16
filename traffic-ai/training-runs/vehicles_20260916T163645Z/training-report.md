# Vehicle detector training results

Completed 4 epochs on cpu.
Trained checkpoint: `C:\Users\sakshi\new sih\ai-powered\traffic-ai\models\vehicles_20260916T163645Z.pt`

| Evaluation | mAP50 | mAP50-95 |
|---|---:|---:|
| Baseline validation | 0.2909 | 0.2068 |
| Trained validation | 0.2777 | 0.1934 |
| Baseline test | 0.2305 | 0.1670 |
| Trained test | 0.2253 | 0.1588 |
| Baseline coco test | 0.5051 | 0.3502 |
| Trained coco test | 0.4683 | 0.3177 |
| Baseline visdrone test | 0.0955 | 0.0583 |
| Trained visdrone test | 0.0994 | 0.0573 |

Packaged bus image retained bus detection at confidence 0.35: True.

- General COCO vehicle imagery plus aerial VisDrone scenes; not BMTC camera footage.
- COCO val2017 images are held out from this fine-tuning, but belong to the baseline model's original benchmark.
- COCO images with crowd vehicle annotations are excluded; nonvehicle categories are omitted.
- VisDrone ignored regions are omitted; these are custom subset metrics, not official challenge scores.
- Only vehicle-positive images are sampled; road-scene negatives and local footage are still needed.
- Only five vehicle classes were fine-tuned; the original COCO class IDs/head were retained.
- Traffic-level thresholds, tracking, flow and speed were not trained.
- The original default checkpoint is preserved. Use --model to select the trained checkpoint.

Dataset sources:
https://cocodataset.org/#download
https://github.com/VisDrone/VisDrone-Dataset

## Video pipeline review

The trained model detected the bus in all 12 synthetic-pan frames, but also produced an overlapping truck detection on that bus (first-frame IoU 0.975). This double-counts the vehicle. A 60-frame unlabelled road excerpt also processed successfully with zero detections. Neither clip is an accuracy benchmark.

Decision: retain `models/yolo26n.pt` as the active default. The fine-tuned checkpoint remains experimental. Its checksum matches the report, and 261 weight/bias tensors changed from the pretrained model.
