import sharp from "sharp";

const sheets = [
  { name: "expressions", path: "public/companions/companion-expressions.png", width: 384, height: 64 },
  { name: "fur", path: "public/companions/companion-fur.png", width: 64, height: 512 },
  { name: "patchPrimary", path: "public/companions/companion-patch-primary.png", width: 64, height: 512 },
  { name: "patchSecondary", path: "public/companions/companion-patch-secondary.png", width: 64, height: 512 }
];

function hex(red, green, blue) {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

async function inspect(sheet) {
  const image = sharp(sheet.path);
  const metadata = await image.metadata();
  if (metadata.width !== sheet.width || metadata.height !== sheet.height || metadata.channels !== 4) {
    throw new Error(`${sheet.path} must be ${sheet.width}x${sheet.height} RGBA`);
  }
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  let transparentPixels = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] === 0) transparentPixels += 1;
  }
  const rows = sheet.height === 512 ? Array.from({ length: 8 }, (_, row) => {
    const colours = new Map();
    for (let y = row * 64; y < (row + 1) * 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const index = (y * sheet.width + x) * 4;
        if (data[index + 3] === 0) continue;
        const colour = hex(data[index], data[index + 1], data[index + 2]);
        colours.set(colour, (colours.get(colour) || 0) + 1);
      }
    }
    return [...colours].sort((left, right) => right[1] - left[1])[0]?.[0];
  }) : [];
  if (!transparentPixels) throw new Error(`${sheet.path} must contain transparency`);
  return { width: metadata.width, height: metadata.height, channels: metadata.channels, rows, transparentPixels };
}

const result = {};
for (const sheet of sheets) result[sheet.name] = await inspect(sheet);
console.log(JSON.stringify(result, null, 2));
