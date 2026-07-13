#!/usr/bin/env python3
"""
Coritiba Asset Preprocessing Pipeline
Prepares all images for AI training (stadium mockups, jersey LoRA, campaign creatives)
"""

import os
import sys
import json
import shutil
from pathlib import Path
from PIL import Image, ImageStat, ImageFilter
import hashlib

BASE = Path("/home/ubuntu/Market_Sponsorship_Automation/assets")
TRAINING_DATA = Path("/home/ubuntu/Market_Sponsorship_Automation/training-data")

# Output directories for training-ready data
TRAINING_DATA.mkdir(exist_ok=True)
(TRAINING_DATA / "stadium_mockup").mkdir(exist_ok=True)
(TRAINING_DATA / "jersey_lora").mkdir(exist_ok=True)
(TRAINING_DATA / "brand_creatives").mkdir(exist_ok=True)

REPORT = {"processed": [], "skipped": [], "errors": [], "summary": {}}

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def get_image_quality_score(img: Image.Image) -> dict:
    """Score an image on sharpness, exposure and size."""
    # Convert to grayscale for analysis
    gray = img.convert("L")
    # Sharpness via Laplacian variance proxy (edge detection)
    edges = gray.filter(ImageFilter.FIND_EDGES)
    stat_edges = ImageStat.Stat(edges)
    sharpness = stat_edges.var[0]  # higher = sharper

    # Exposure — mean brightness should be 80-200 (well exposed)
    stat = ImageStat.Stat(gray)
    brightness = stat.mean[0]

    # Size score
    w, h = img.size
    megapixels = (w * h) / 1_000_000

    return {
        "sharpness": round(sharpness, 1),
        "brightness": round(brightness, 1),
        "megapixels": round(megapixels, 1),
        "width": w,
        "height": h,
        "is_sharp": sharpness > 80,
        "is_exposed": 60 < brightness < 220,
        "is_large_enough": megapixels >= 0.5,
    }

def resize_for_training(img: Image.Image, target_size: tuple, mode: str = "fill") -> Image.Image:
    """
    Resize image for training.
    mode='fill': crop to exact size (for LoRA which needs square/exact)
    mode='fit': fit within bounds keeping aspect ratio (for mockup base images)
    """
    if mode == "fill":
        img = img.convert("RGB")
        # Crop to center square first
        w, h = img.size
        short = min(w, h)
        left = (w - short) // 2
        top = (h - short) // 2
        img = img.crop((left, top, left + short, top + short))
        img = img.resize(target_size, Image.LANCZOS)
    elif mode == "fit":
        img = img.convert("RGB")
        img.thumbnail(target_size, Image.LANCZOS)
    return img

def save_with_caption(img: Image.Image, out_path: Path, caption: str) -> None:
    """Save image and its caption txt file for LoRA training."""
    img.save(out_path, quality=95)
    caption_path = out_path.with_suffix(".txt")
    caption_path.write_text(caption)

def file_hash(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()[:8]

# ─────────────────────────────────────────────
# 1. STADIUM PHOTOS → stadium_mockup training set
# ─────────────────────────────────────────────

def process_stadium():
    print("\n" + "="*60)
    print("PROCESSING STADIUM PHOTOS")
    print("="*60)

    out_dir = TRAINING_DATA / "stadium_mockup"
    processed = 0
    skipped = 0

    subfolders = {
        "pitch_level": ("couto_pereira_stadium_pitch_level", "high priority"),  # best for LED mockups
        "fans": ("couto_pereira_stadium_fans", "medium priority"),
        "interior": ("couto_pereira_stadium_interior", "medium priority"),
        "aerial": ("couto_pereira_stadium_aerial", "low priority"),
    }

    for subfolder, (prefix, priority) in subfolders.items():
        src_dir = BASE / "stadium" / subfolder
        if not src_dir.exists():
            print(f"  SKIP {subfolder}: folder not found")
            continue

        images = list(src_dir.glob("*.JPG")) + list(src_dir.glob("*.jpg")) + list(src_dir.glob("*.jpeg"))
        print(f"\n  [{subfolder}] {len(images)} images ({priority})")

        sub_out = out_dir / subfolder
        sub_out.mkdir(exist_ok=True)

        for i, img_path in enumerate(sorted(images)):
            try:
                with Image.open(img_path) as img:
                    q = get_image_quality_score(img)

                    # Filter: skip blurry, badly exposed, or tiny images
                    if not q["is_large_enough"]:
                        print(f"    SKIP {img_path.name}: too small ({q['megapixels']} MP)")
                        skipped += 1
                        REPORT["skipped"].append(str(img_path.name))
                        continue

                    if not q["is_exposed"]:
                        print(f"    SKIP {img_path.name}: bad exposure (brightness={q['brightness']:.0f})")
                        skipped += 1
                        REPORT["skipped"].append(str(img_path.name))
                        continue

                    # Resize to 1024x1024 max (keeping aspect ratio) — good for inpainting base
                    processed_img = resize_for_training(img, (1024, 1024), mode="fit")

                    # Save with descriptive name
                    out_name = f"{prefix}_{i+1:03d}.jpg"
                    out_path = sub_out / out_name
                    processed_img.save(out_path, quality=92)

                    print(f"    ✓ {img_path.name} → {out_name} ({q['megapixels']}MP, sharp={q['is_sharp']})")
                    processed += 1
                    REPORT["processed"].append({
                        "src": str(img_path.name),
                        "dst": str(out_path.relative_to(TRAINING_DATA)),
                        "type": "stadium",
                        "subfolder": subfolder,
                        "quality": q,
                    })

            except Exception as e:
                print(f"    ERROR {img_path.name}: {e}")
                REPORT["errors"].append({"file": str(img_path.name), "error": str(e)})

    print(f"\n  Stadium total: {processed} processed, {skipped} skipped")
    REPORT["summary"]["stadium"] = {"processed": processed, "skipped": skipped}
    return processed


# ─────────────────────────────────────────────
# 2. JERSEY PHOTOS → jersey_lora training set
# ─────────────────────────────────────────────

def process_jerseys():
    print("\n" + "="*60)
    print("PROCESSING JERSEY/UNIFORM PHOTOS")
    print("="*60)

    out_dir = TRAINING_DATA / "jersey_lora"
    processed = 0
    skipped = 0

    # Caption templates for each jersey type
    captions = {
        "home": "coritiba fc 2026 home jersey kit, white jersey with green stripes, coritiba badge on chest",
        "goalkeeper": "coritiba fc 2026 goalkeeper jersey kit, green jersey, coritiba badge on chest",
        "womens": "coritiba fc 2026 womens jersey kit, white jersey with green stripes, coritiba badge on chest",
        "shorts": "coritiba fc 2026 football shorts, white shorts, coritiba kit",
        "training": "coritiba fc 2026 training kit, training wear, coritiba badge",
    }

    for subfolder, caption in captions.items():
        src_dir = BASE / "jerseys" / subfolder
        if not src_dir.exists():
            print(f"  SKIP {subfolder}: folder not found")
            continue

        images = (list(src_dir.glob("*.JPG")) + list(src_dir.glob("*.jpg")) +
                  list(src_dir.glob("*.jpeg")) + list(src_dir.glob("*.JPEG")))
        # Handle .jpg.jpeg double extension
        images += list(src_dir.glob("*.jpg.jpeg"))
        print(f"\n  [{subfolder}] {len(images)} images")

        sub_out = out_dir / subfolder
        sub_out.mkdir(exist_ok=True)

        for i, img_path in enumerate(sorted(images)):
            try:
                with Image.open(img_path) as img:
                    q = get_image_quality_score(img)

                    if not q["is_large_enough"]:
                        print(f"    SKIP {img_path.name}: too small")
                        skipped += 1
                        continue

                    if not q["is_exposed"]:
                        print(f"    SKIP {img_path.name}: bad exposure")
                        skipped += 1
                        continue

                    # LoRA training: resize to 512x512 (square crop) — standard LoRA format
                    processed_img = resize_for_training(img, (512, 512), mode="fill")

                    out_name = f"coritiba_jersey_{subfolder}_{i+1:03d}.jpg"
                    out_path = sub_out / out_name

                    save_with_caption(processed_img, out_path, caption)

                    # Also save a 1024x1024 version for SDXL LoRA
                    processed_img_xl = resize_for_training(img, (1024, 1024), mode="fill")
                    out_name_xl = f"coritiba_jersey_{subfolder}_{i+1:03d}_1024.jpg"
                    save_with_caption(processed_img_xl, sub_out / out_name_xl, caption)

                    print(f"    ✓ {img_path.name} → {out_name} + 1024px version")
                    processed += 1
                    REPORT["processed"].append({
                        "src": str(img_path.name),
                        "dst": str(out_path.relative_to(TRAINING_DATA)),
                        "type": "jersey",
                        "subfolder": subfolder,
                        "quality": q,
                        "caption": caption,
                    })

            except Exception as e:
                print(f"    ERROR {img_path.name}: {e}")
                REPORT["errors"].append({"file": str(img_path.name), "error": str(e)})

    print(f"\n  Jersey total: {processed} processed, {skipped} skipped")
    REPORT["summary"]["jerseys"] = {"processed": processed, "skipped": skipped}
    return processed


# ─────────────────────────────────────────────
# 3. BRAND / CAMPAIGN PHOTOS → brand_creatives
# ─────────────────────────────────────────────

def process_brand():
    print("\n" + "="*60)
    print("PROCESSING BRAND & CAMPAIGN ASSETS")
    print("="*60)

    out_dir = TRAINING_DATA / "brand_creatives"
    processed = 0
    skipped = 0

    subfolders = {
        "campaigns_photos": "coritiba fc official campaign photo, professional sports photography, coritiba branding",
        "campaigns_social": "coritiba fc social media graphic, coritiba branding, sports marketing",
    }

    for subfolder, caption in subfolders.items():
        src_dir = BASE / "brand" / subfolder
        if not src_dir.exists():
            continue

        images = (list(src_dir.glob("*.jpg")) + list(src_dir.glob("*.JPG")) +
                  list(src_dir.glob("*.jpeg")) + list(src_dir.glob("*.png")) +
                  list(src_dir.glob("*.PNG")))
        print(f"\n  [{subfolder}] {len(images)} images")

        sub_out = out_dir / subfolder
        sub_out.mkdir(exist_ok=True)

        for i, img_path in enumerate(sorted(images)):
            try:
                with Image.open(img_path) as img:
                    q = get_image_quality_score(img)

                    if not q["is_large_enough"]:
                        skipped += 1
                        continue

                    # Brand: 768x768 (good balance for creatives)
                    processed_img = resize_for_training(img, (768, 768), mode="fit")

                    out_name = f"coritiba_brand_{subfolder}_{i+1:03d}.jpg"
                    out_path = sub_out / out_name
                    save_with_caption(processed_img, out_path, caption)

                    print(f"    ✓ {img_path.name} → {out_name}")
                    processed += 1
                    REPORT["processed"].append({
                        "src": str(img_path.name),
                        "dst": str(out_path.relative_to(TRAINING_DATA)),
                        "type": "brand",
                        "quality": q,
                    })

            except Exception as e:
                print(f"    ERROR {img_path.name}: {e}")
                REPORT["errors"].append({"file": str(img_path.name), "error": str(e)})

    # Copy logos directly (no resize)
    logos_src = BASE / "brand" / "logos"
    logos_out = out_dir / "logos"
    logos_out.mkdir(exist_ok=True)
    for f in logos_src.glob("*"):
        if f.suffix.lower() in [".png", ".jpg", ".jpeg", ".svg"]:
            shutil.copy2(f, logos_out / f.name)
            print(f"  ✓ Logo: {f.name}")

    print(f"\n  Brand total: {processed} processed, {skipped} skipped")
    REPORT["summary"]["brand"] = {"processed": processed, "skipped": skipped}
    return processed


# ─────────────────────────────────────────────
# 4. SELECT BEST STADIUM SHOTS FOR ACTIVE USE
# ─────────────────────────────────────────────

def select_best_stadium_shots():
    """Pick the top 8 pitch-level shots with LED boards visible for active mockup use."""
    print("\n" + "="*60)
    print("SELECTING BEST STADIUM SHOTS FOR ACTIVE MOCKUP USE")
    print("="*60)

    src_dir = TRAINING_DATA / "stadium_mockup" / "pitch_level"
    best_dir = TRAINING_DATA / "stadium_mockup" / "best_for_mockups"
    best_dir.mkdir(exist_ok=True)

    candidates = []
    for img_path in sorted(src_dir.glob("*.jpg")):
        try:
            with Image.open(img_path) as img:
                q = get_image_quality_score(img)
                candidates.append((q["sharpness"] * (1 if q["is_exposed"] else 0.5), img_path, q))
        except:
            pass

    # Sort by sharpness score descending, take top 10
    candidates.sort(key=lambda x: x[0], reverse=True)
    selected = candidates[:10]

    for score, path, q in selected:
        shutil.copy2(path, best_dir / path.name)
        print(f"  ★ {path.name} (sharpness={q['sharpness']:.0f}, brightness={q['brightness']:.0f})")

    print(f"\n  Selected {len(selected)} best shots for active mockup use → training-data/stadium_mockup/best_for_mockups/")
    REPORT["summary"]["best_stadium_shots"] = len(selected)


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

if __name__ == "__main__":
    print("🎯 Coritiba Asset Preprocessing Pipeline")
    print("="*60)
    print(f"Base: {BASE}")
    print(f"Output: {TRAINING_DATA}")

    s = process_stadium()
    j = process_jerseys()
    b = process_brand()
    select_best_stadium_shots()

    # Save report
    report_path = Path("/home/ubuntu/Market_Sponsorship_Automation/preprocessing_report.json")
    with open(report_path, "w") as f:
        json.dump(REPORT, f, indent=2)

    print("\n" + "="*60)
    print("PREPROCESSING COMPLETE")
    print("="*60)
    print(f"  Stadium photos:  {REPORT['summary'].get('stadium', {}).get('processed', 0)} processed")
    print(f"  Jersey photos:   {REPORT['summary'].get('jerseys', {}).get('processed', 0)} processed (×2 sizes)")
    print(f"  Brand assets:    {REPORT['summary'].get('brand', {}).get('processed', 0)} processed")
    print(f"  Best stadium:    {REPORT['summary'].get('best_stadium_shots', 0)} curated shots")
    print(f"  Errors:          {len(REPORT['errors'])}")
    print(f"  Report saved:    {report_path}")
    print("")
    print("Training-data folder structure:")
    for root, dirs, files in os.walk(TRAINING_DATA):
        level = root.replace(str(TRAINING_DATA), '').count(os.sep)
        indent = '  ' * level
        print(f"{indent}{os.path.basename(root)}/ ({len(files)} files)")
