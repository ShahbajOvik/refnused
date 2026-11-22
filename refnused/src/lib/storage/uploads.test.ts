// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { preparePdf, preparePhoto, UploadError } from "./uploads";

async function photoWithLocation() {
  const bytes = await sharp({
    create: { width: 64, height: 48, channels: 3, background: "#0f7a63" },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestCam", Model: "Spy 1", Artist: "Jo Bloggs" },
      // IFD3 is GPS: a location in North Shields.
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "55/1 0/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "1/1 26/1 0/1",
      },
    })
    .toBuffer();
  const meta = await sharp(bytes).metadata();
  expect(meta.exif?.length).toBeGreaterThan(0); // the fixture really has EXIF
  return new File([new Uint8Array(bytes)], "photo.jpg", { type: "image/jpeg" });
}

describe("preparePhoto", () => {
  it("re-encodes to WebP and strips EXIF, including GPS", async () => {
    const out = await preparePhoto(await photoWithLocation());
    expect(out.contentType).toBe("image/webp");
    const meta = await sharp(Buffer.from(out.bytes)).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(Buffer.from(out.bytes).includes(Buffer.from("TestCam"))).toBe(false);
    expect(Buffer.from(out.bytes).includes(Buffer.from("Jo Bloggs"))).toBe(false);
  });

  it("rejects files that aren't photos, whatever they claim to be", async () => {
    const svg = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
      "x.jpg",
      { type: "image/jpeg" },
    );
    await expect(preparePhoto(svg)).rejects.toBeInstanceOf(UploadError);
    const html = new File(["<html><script>alert(1)</script></html>"], "x.png", {
      type: "image/png",
    });
    await expect(preparePhoto(html)).rejects.toBeInstanceOf(UploadError);
    await expect(preparePhoto(new File([], "empty.jpg"))).rejects.toBeInstanceOf(UploadError);
  });

  it("only accepts real PDFs as certificates", async () => {
    await expect(
      preparePdf(new File(["<html></html>"], "c.pdf", { type: "application/pdf" })),
    ).rejects.toBeInstanceOf(UploadError);
  });
});
