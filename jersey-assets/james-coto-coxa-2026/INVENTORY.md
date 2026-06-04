# James — Coto Coxa Images (WeTransfer)

**From:** james97deller@gmail.com  
**Subject:** Coto Coxa Images.zip via WeTransfer  
**Received:** 2 June 2026  
**Downloaded to EC2:** 4 June 2026  
**WeTransfer expires:** 5 June 2026 (link may stop working after that)  
**Local path:** `jersey-assets/james-coto-coxa-2026/`

---

## Archive structure

Outer zip `Coto_Coxa_Images.zip` (2.04 GB) contains folder **Aquece Coxa** with four inner zips:

| Inner zip | Size | Extracted to | Contents |
|-----------|------|--------------|----------|
| `Aquece Coxa.zip` | ~1.49 GB | `nested/aquece_coxa/` | **Aquece Coxa** warmup campaign — 11 JPG/PNG + 1 DNG + **2 MP4** (1.1 GB + 360 MB) |
| `DJI 0007 June 2026.zip` | ~554 MB | `nested/dji_0007_june_2026/` | **39 JPG** + 3 DNG — event/studio (DSC*, DJI_*, Setembro Caramelo) |
| `Couto Pereira.zip` | ~81 MB | `nested/couto_pereira/` | **7 JPG** + 3 DNG — stadium drone (Couto Pereira) |
| `UNIFORM.zip` | ~17 MB | `nested/uniform/UNIFORM/` | **12 kit flat assets** — Home, Jogadeira, Shorts, Meias, Escudo, player photos |

**Total media files (excl. macOS junk):** 78  
**Trainable stills (JPG/PNG/JPEG):** 69 → copied to `lora-training-candidates/`  
**RAW (DNG):** 7 — convert to JPG before training if needed  
**Video (MP4):** 2 — not used for LoRA; useful for landing/demo only  

---

## LoRA training value (tomorrow)

### High priority — `uniform/`

Flat kit graphics (best for shorts/socks/back retrain):

- `Home.png`, `Jogadeira.png` — jerseys  
- `Shorts Preto.png`, `Shorts Off-White.png`  
- `Meião Cinza.png`, `Meião Verde.png`, `Meião Off-White.png`  
- `Escudo Coritiba.png`  
- Player/lifestyle JPEGs: `CFC-45`, `CFC-63`, `DSCF8555`, `Gustavo Oliveira CFC`

### Medium — `dji_0007_june_2026/`

Large Sony/DJI stills (~525 MB JPG) — campaign/event; good for jersey in context + stadium atmosphere.

### Medium — `aquece_coxa/` + `couto_pereira/`

Drone warmup + stadium shots — brand/stadium LoRA context; fewer unique jersey angles than `uniform/`.

### Skip for LoRA zip

- `DJI_0012.MP4`, `DJI_0018.MP4` — keep for video demo roadmap only  

---

## Replicate retrain checklist (pending)

1. [ ] Curate 15–30 **RGB** images from `lora-training-candidates/` (prioritize `uniform_*` + best front/side jersey JPGs)  
2. [ ] Remove duplicates / grayscale masks (same rules as May 2026 train)  
3. [ ] Build `coritiba_jersey_lora_training_v2.zip` with trigger word `coritiba_jersey`  
4. [ ] Train on [ostris/flux-dev-lora-trainer](https://replicate.com/ostris/flux-dev-lora-trainer) (~1000 steps)  
5. [ ] Update `REPLICATE_MODEL_VERSION` in `.env` / health check  
6. [ ] Enable `back`, `shorts`, `socks` in `frontend/lib/media/jersey-placements.ts`  
7. [ ] Re-run INTERN_TEST_PLAN T-25–T-27, T-56  

**Current production model (unchanged until retrain):** `abhishek9302/coritiba-jersey-lora:396810db` (27 May, 15 images from Camisa 2026 PDF)

---

## Still waiting from James

| Item | Status |
|------|--------|
| Additional kit angles / back-only photos | James said more coming soon |
| Brand/email creative templates | Not in this zip |
| Apollo / commercial sign-offs | Separate |

---

## Disk layout on EC2

```
james-coto-coxa-2026/
├── Coto_Coxa_Images.zip      # original download (2.04 GB)
├── archives/                 # copies of inner zips
├── extracted/                # outer unzip
├── nested/                   # all four inner zips extracted
├── lora-training-candidates/ # 69 JPG/PNG copies for curation (638 MB)
└── INVENTORY.md              # this file
```

**Note:** Large binaries are gitignored; assets live on the EC2 server only.
