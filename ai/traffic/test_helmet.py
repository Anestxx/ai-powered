from ultralytics import YOLO

model = YOLO("models/helmet_detector.pt")

print("✅ Helmet AI loaded successfully!")
print("Classes:")
print(model.names)