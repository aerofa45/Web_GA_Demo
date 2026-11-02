# Images and Photoshop workflow

## Completed open-source editing exercise (edition 3)

At the user's request, miniPaint 4.14.3 was used instead of Photoshop. The generated 1536×1024 PNG was opened in the editor, resized using Lanczos to 1280×853, then cropped by reducing the canvas to 1200×800 with autoresize off. It was exported as JPEG at quality 82. The native editable project is `evidence/studio-cropped-editable.json`; reopen it through miniPaint's File → Open File menu. The exported source used by the website is `public/images/studio-edited-source.jpg`.

Export-settings and canvas screenshots are in `evidence/minipaint-export-settings.png` and `evidence/minipaint-cropped-canvas.png`. Actual bytes: original PNG 2,224,210; edited JPEG 159,539; 1200px WebP derivative 94,144 (about 96% fewer bytes than the original PNG, with changed dimensions/format/quality). This is a measured delivery reduction, not a like-for-like lossless comparison. `evidence/image-edit-report.json` records the settings and measurements. Sharp derivatives are now 640×427 and 1200×800, without upscaling.

No Photoshop session or PSD is claimed. The equivalent open-source workflow is complete; Photoshop-specific proficiency still requires personal hands-on practice in that application. The instructions below are retained as an optional Photoshop practice exercise, not as the current hero export recipe.

The retained original `public/images/campus-source.svg` illustration was authored for this project. It depicts a fictional campus and is not a photo or a SEMO building. It was used in version 1. The redesigned hero now uses generated concept imagery with a descriptive alternative and explicit AI caption.

Run `npm run images` to regenerate 640×480 and 1280×960 campus illustration files, plus 640×427 and 1280×853 studio hero WebP/JPEG files with Sharp. The script records dimensions and actual bytes in `public/images/manifest.json`. The browser chooses a WebP using `srcset`/`sizes`, with a JPEG fallback. Width and height reserve layout space. The hero has high fetch priority rather than lazy loading; below-fold photos added later should normally be lazy loaded.

The compressed raster files may be larger than this simple vector source: this is an export workflow demonstration, not a claim that rasterizing an SVG saves bytes. For a real vector illustration, serving SVG may be preferable. For a photographic exercise, use an authorized high-resolution source and record original versus exported size and visual quality.

## Photoshop exercise (not yet performed)

1. Open an authorized source photo or this SVG in Photoshop. Retain an untouched original. Record author, source, usage rights, original dimensions and bytes.
2. Crop to 4:3 with the focal subject clear at mobile sizes. Keep meaningful details away from edges; avoid embedding text in images.
3. Convert to sRGB; resize copies to 1280×960 and 640×480. Do not upscale a small source.
4. Use Export As / Save for Web as available in your Photoshop version for JPEG; use supported WebP export where available, or generate WebP through this project's Sharp script after saving your edited source. Adjust quality while checking edges and gradients at 100%.
5. Remove unnecessary metadata, preserve required attribution, and compare actual byte counts and visible quality. Use the manifest as a record format, not as evidence that Photoshop was used.
6. Save layered PSD separately, plus before/after screenshots and an export settings record. Replace demo assets, adjust alt text to the new image's purpose, regenerate variants, and test layout.

Do not claim Photoshop competency solely from running Sharp. Complete the exercise and add your own screenshots/PSD evidence for an honest application portfolio.


Repository packaging: the editable JSON embeds a compressed WebP raster to keep it small; it was reopened successfully in miniPaint. The exact original native JSON and generated PNG are retained in originals/ in the downloadable ZIP. Repository audit reports omit screenshot-only diagnostics while preserving scores and measurements; the full raw Lighthouse reports remain in the downloadable package.
