const MAX_SOURCE_SIZE = 20 * 1024 * 1024;
const TARGET_SIZE = 1024 * 1024;
const MAX_EDGE = 1800;

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片压缩失败")), type, quality);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`无法读取图片：${file.name}`));
    };
    image.src = url;
  });
}

export async function compressHomeworkImage(file) {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} 不是图片`);
  if (file.size > MAX_SOURCE_SIZE) throw new Error(`${file.name} 超过 20 MB`);
  const image = await loadImage(file);
  const ratio = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  let width = Math.max(1, Math.round(image.naturalWidth * ratio));
  let height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("这台设备暂时无法处理图片");

  let blob;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    blob = await canvasToBlob(canvas, "image/webp", Math.max(.58, .82 - attempt * .08));
    if (blob.size <= TARGET_SIZE) break;
    width = Math.max(1, Math.round(width * .84));
    height = Math.max(1, Math.round(height * .84));
  }
  return { blob, width: canvas.width, height: canvas.height, extension: "webp", mimeType: "image/webp" };
}
