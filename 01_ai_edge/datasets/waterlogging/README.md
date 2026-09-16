# Waterlogging dataset

Put real, labeled images in these directories before running training:

```text
images/train/    labels/train/
images/val/      labels/val/
images/test/     labels/test/      # optional evaluation split
```

For each image, create a label file with the same basename. For example, `images/train/flood_001.jpg` uses `labels/train/flood_001.txt`.

Each line describes one waterlogged area in YOLO format. There is exactly one class: `0` for `waterlogging`.

```text
0 <center_x> <center_y> <width> <height>
```

All four coordinate values are normalized decimals from `0` to `1`. Do not use empty placeholder images or labels for training.
