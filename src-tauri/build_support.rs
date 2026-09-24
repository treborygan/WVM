pub fn ico_from_png(png: &[u8]) -> Vec<u8> {
    let image_size = u32::try_from(png.len()).expect("PNG payload must fit in an ICO entry");
    let mut ico = Vec::with_capacity(22 + png.len());

    // ICONDIR: reserved, icon type, and a single image.
    ico.extend_from_slice(&[0, 0, 1, 0, 1, 0]);
    // ICONDIRENTRY: 32x32, true color, one plane, 32 bits per pixel.
    ico.extend_from_slice(&[32, 32, 0, 0, 1, 0, 32, 0]);
    ico.extend_from_slice(&image_size.to_le_bytes());
    ico.extend_from_slice(&22_u32.to_le_bytes());
    ico.extend_from_slice(png);

    ico
}
