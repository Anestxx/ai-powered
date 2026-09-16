from enum import StrEnum


class EventType(StrEnum):
    POTHOLE = "pothole"
    ROAD_DAMAGE = "road_damage"
    ROAD_OBSTACLE = "road_obstacle"
    STALLED_VEHICLE = "stalled_vehicle"
    ACCIDENT_SUSPECTED = "accident_suspected"
    CONGESTION = "congestion"
    WATERLOGGING = "waterlogging"
    CONSTRUCTION = "construction"
    EMERGENCY_VEHICLE = "emergency_vehicle"


class EventStatus(StrEnum):
    DETECTED = "detected"
    CONFIRMED = "confirmed"
    UNDER_REPAIR = "under_repair"
    POSSIBLY_RESOLVED = "possibly_resolved"
    RESOLVED = "resolved"
    REJECTED = "rejected"


class Severity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Role(StrEnum):
    ADMIN = "admin"
    MUNICIPALITY = "municipality"
    TRAFFIC_POLICE = "traffic_police"
    TRANSPORT_DEPARTMENT = "transport_department"
    VIEWER = "viewer"
