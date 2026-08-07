from app.database import SessionLocal
from app.models import ChildDevice, Guardian, ConsentGrant
import uuid


def assign_devices():
    db = SessionLocal()
    try:
        guardians = db.query(Guardian).all()
        print(f"Total guardians: {len(guardians)}")
        for g in guardians:
            count = (
                db.query(ChildDevice).filter(ChildDevice.guardian_id == g.id).count()
            )
            if count == 0:
                print(f"Adding demo device to guardian: {g.email}")
                dev = ChildDevice(
                    id=str(uuid.uuid4()),
                    guardian_id=g.id,
                    name="Demo Teen (Auto-assigned)",
                    platform="ios",
                    device_token="demo-" + str(uuid.uuid4())[:8],
                )
                db.add(dev)
                db.flush()
                for mod in [
                    "location",
                    "typing",
                    "app_usage",
                    "gsr",
                    "voice",
                    "companion_chat",
                    "pulse",
                ]:
                    db.add(
                        ConsentGrant(subject_id=dev.id, modality=mod, is_granted=True)
                    )
        db.commit()
        print("Done fixing demo devices.")
    finally:
        db.close()


if __name__ == "__main__":
    assign_devices()
