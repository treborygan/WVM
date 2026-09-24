#[path = "../build_support.rs"]
mod build_support;

#[test]
fn wraps_png_bytes_in_a_single_32_bit_ico_entry() {
    let png = [137, 80, 78, 71, 1, 2, 3];
    let ico = build_support::ico_from_png(&png);

    assert_eq!(ico.len(), 22 + png.len());
    assert_eq!(&ico[0..6], &[0, 0, 1, 0, 1, 0]);
    assert_eq!(&ico[6..14], &[32, 32, 0, 0, 1, 0, 32, 0]);
    assert_eq!(
        u32::from_le_bytes(ico[14..18].try_into().unwrap()),
        png.len() as u32
    );
    assert_eq!(u32::from_le_bytes(ico[18..22].try_into().unwrap()), 22);
    assert_eq!(&ico[22..], &png);
}
