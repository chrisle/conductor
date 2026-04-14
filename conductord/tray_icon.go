package main

import (
	_ "embed"
	"encoding/binary"
)

// trayIconPNG is a 22x22 template PNG (white on transparent).
// macOS uses the alpha channel to render it in the menu bar.
//
//go:embed tray_icon.png
var trayIconPNG []byte

// trayIconPNG2x is the @2x (44x44) retina variant.
//
//go:embed tray_icon_2x.png
var trayIconPNG2x []byte

// trayIconColorPNG is a 22x22 full-color PNG for Windows.
//
//go:embed tray_icon_color.png
var trayIconColorPNG []byte

// trayIconICO wraps the color PNG in a minimal ICO container for Windows.
var trayIconICO []byte

func init() {
	trayIconICO = pngToICO(trayIconColorPNG, 22, 22)
}

// pngToICO wraps PNG image bytes in a single-entry ICO container. ICO files
// containing PNG data are supported by Windows Vista+.
func pngToICO(pngBytes []byte, width, height int) []byte {
	// ICO header: 6 bytes + 16-byte entry = 22 bytes of header.
	const headerSize = 6 + 16
	buf := make([]byte, 0, headerSize+len(pngBytes))
	// ICONDIR header
	buf = binary.LittleEndian.AppendUint16(buf, 0) // reserved
	buf = binary.LittleEndian.AppendUint16(buf, 1) // type: 1 = icon
	buf = binary.LittleEndian.AppendUint16(buf, 1) // count
	// ICONDIRENTRY
	w := byte(width)
	h := byte(height)
	if width >= 256 {
		w = 0
	}
	if height >= 256 {
		h = 0
	}
	buf = append(buf, w, h, 0, 0) // width, height, colors, reserved
	buf = binary.LittleEndian.AppendUint16(buf, 1)                    // color planes
	buf = binary.LittleEndian.AppendUint16(buf, 32)                   // bits per pixel
	buf = binary.LittleEndian.AppendUint32(buf, uint32(len(pngBytes))) // size
	buf = binary.LittleEndian.AppendUint32(buf, headerSize)            // offset
	buf = append(buf, pngBytes...)
	return buf
}
