# Vehicle detector training

The initial `models/yolo26n.pt` is a pretrained general-object detector. Training
here performs additional supervised learning from real annotated vehicle images.
BoT-SORT association and the LOW/MODERATE/HIGH/SEVERE thresholds are separate from
this detector training.

Two local training experiments have completed. See [TRAINING_RESULTS.md](TRAINING_RESULTS.md)
for checkpoints, measured scores, regression findings and the active-model decision.

## Run in your terminal

From `traffic-ai/` in PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\train.ps1
```

This prepares data if needed, measures the original model, fine-tunes for four
epochs, and evaluates the selected checkpoint. It prints progress in the terminal
and saves a timestamped terminal log in `training-runs/`.

Equivalent direct Python command:

```powershell
.venv\Scripts\python -u train_traffic.py --epochs 4 --batch 2 --imgsz 416 --threads 4 --lr 0.00005
```

The defaults target this laptop: Intel graphics, CPU PyTorch, 16 GB system RAM,
with limited available memory at setup. It uses batch size 2, no image RAM cache,
no background data-loader workers, and freezes the first 10 backbone layers.
Remaining parameters are trained with AdamW at a conservative initial learning
rate of 0.00005, with zero initial bias learning rate during warmup. Four CPU
computation threads are used. This is an initial fine-tuning experiment; it does not establish
deployment readiness.

You can request more epochs with `-Epochs 30` or `--epochs 30`. Each invocation
starts a new experiment from the original pretrained weights and preserves older
experiments. It does not silently overwrite the existing detector.

## Data

The current default mixes COCO general vehicle images with VisDrone aerial scenes.
The first aerial-only run improved aerial scores but lost detection of the bus in
the packaged ground-level sample. Its checkpoint is retained as an experiment;
the app continues to use the original pretrained detector by default.

- [COCO 2017](https://cocodataset.org/#download): 256 training images from train2017,
  80 validation and 80 test images from disjoint subsets of val2017. Images with
  crowd vehicle regions are excluded. Every non-crowd target vehicle box in each
  selected image is retained, clipped to image boundaries, and normalized.
- Mixed with 256 training, 48 validation and 48 test images from the existing
  VisDrone subset below. These preserve its scene-group split boundaries.
- Total: **512 training, 128 validation and 128 test images**. The manifests record
  image IDs, source splits/groups, hashes, license IDs for COCO, and object counts.
  Exact duplicate images within/across splits are rejected.
- `prepare_mixed_data.py` downloads the approximately 241 MB official annotation
  archive and only the 416 selected COCO images. It uses the public COCO S3 bucket
  over verified HTTPS and streams annotation JSON to limit memory consumption.
- COCO val2017 images are held out from this fine-tuning, but they are part of the
  original pretrained model's benchmark. This is a retention check, not evidence
  that the baseline has never encountered the evaluation domain.
- COCO images are general photographs, not calibrated BMTC camera recordings.
  Both subsets sample vehicle-positive images; local road footage and negative
  examples still need annotation before field deployment.
- `data.yaml` evaluates the mixture; `coco.yaml` and `visdrone.yaml` evaluate each
  domain separately. `train_traffic.py --data <path-to-data.yaml>` can select a
  prepared dataset explicitly. The PowerShell wrapper accepts `-Data` too.

### Original aerial-only experiment

- Source: [VisDrone2019-DET](https://github.com/VisDrone/VisDrone-Dataset), downloaded
  from the public Ultralytics asset mirror, about 1.6 GB for train and validation.
- Original selected images: 512 training, 96 validation, 96 held-out test.
- Training images come from the official training split. Validation/test images
  come from disjoint filename scene groups in the official validation split;
  groups also present in training are excluded. Exact image duplication across
  splits is rejected.
- Five target categories: bicycle, car, motorcycle, bus, truck. Original COCO
  class IDs are retained so the pretrained classifier can be compared directly
  and its learned vehicle weights can be reused. This is not training all 80
  original categories.
- The sampler uses seed 42 and includes rare-class images. The manifest records
  every selected filename, source group, image checksum, and object counts.
- VisDrone images are aerial scenes from China. They are useful labeled traffic
  data, but they do not constitute Bengaluru or BMTC camera training data.
- Ignored boxes/regions and other categories are omitted, matching a simple YOLO
  subset conversion. Measurements are for this custom subset, not official
  VisDrone challenge scores. Road-scene negatives and domain-specific labels
  should be added in a subsequent dataset version.

`prepare_training_data.py` can be run separately. Downloads and extracted data
remain under this project's ignored `datasets/` directory. No files in Downloads
are modified. `videos/road_test.mp4` was copied from the user's project ZIP for
unlabelled inference checking; it is not training ground truth.

## Saved results

Each `training-runs/vehicles_<timestamp>/` contains:

- `progress.json`: current stage, epoch/batch, process ID and timestamps.
- `baseline-validation.json`: measured original-model validation performance.
- `fit/results.csv`: training losses and validation metrics by epoch.
- `fit/weights/best.pt` and `last.pt`, plus periodic epoch checkpoints.
- `training-report.json` and `.md` after successful completion: before/after
  validation and test metrics, per-class results, training settings and checksum.
  Mixed-dataset runs also include separate COCO/VisDrone test scores and a
  qualitative bus-detection check at confidence 0.35 on the packaged sample.

The completed best checkpoint is copied to `models/vehicles_<timestamp>.pt`.
Use its actual path from the report:

```powershell
.venv\Scripts\python traffic_ai.py --source videos/road_test.mp4 --model "models/vehicles_<timestamp>.pt" --save-video --show
```

The default model stays unchanged. Compare validation/test results and inspect
unseen bus-camera footage before choosing a trained checkpoint for normal use.
mAP and confidence thresholds are kept the same for before/after comparisons;
the packaged bus check is a regression smoke test, not a labeled accuracy score.
mAP measures labeled-object detection on these images; it is not a percentage of
correct congestion predictions, and vehicle tracking/flow/speed are not evaluated
by detector mAP.

Training API reference: [Ultralytics train mode](https://docs.ultralytics.com/modes/train/).
