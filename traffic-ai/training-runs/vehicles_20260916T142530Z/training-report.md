# Vehicle detector training results

Completed 8 epochs on cpu.
Trained checkpoint: `C:\Users\sakshi\new sih\ai-powered\traffic-ai\models\vehicles_20260916T142530Z.pt`

| Evaluation | mAP50 | mAP50-95 |
|---|---:|---:|
| Baseline validation | 0.1132 | 0.0713 |
| Trained validation | 0.1738 | 0.1042 |
| Baseline test | 0.0844 | 0.0481 |
| Trained test | 0.1341 | 0.0719 |

- Small public aerial-image subset, not Bengaluru/BMTC bus-camera footage.
- Only five vehicle classes were fine-tuned; the original COCO class IDs/head were retained.
- Traffic-level thresholds, tracking, flow and speed were not trained.
- Subset YOLO metrics omit VisDrone ignored regions; they are not official benchmark scores.
- The original default checkpoint is preserved. Use --model to select the trained checkpoint.

Dataset: https://github.com/VisDrone/VisDrone-Dataset
