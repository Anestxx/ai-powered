# Accident dataset

Run this first from the project folder:

```powershell
python training\prepare_accident_frames.py --video videos\accident.mp4 --fps 5
```

It creates frames in `annotation/images`. Annotate every frame with a YOLO tool such as Roboflow Annotate, CVAT, or LabelImg. Use only class `0`, `accident`, and draw boxes around visible collision evidence (crashed vehicles, the point of impact, or a fallen rider). Do not label normal traffic as an accident.

Then put the completed, matching image/label pairs into the following folders:

```text
images/train/  labels/train/  (about 80%)
images/val/    labels/val/    (about 20%)
```

For normal-road images, retain a matching empty `.txt` label file. Include normal footage from the same type of bus camera; one accident video alone is only suitable for a demonstration, not a deployment-quality detector.
