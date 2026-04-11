package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
)

// trayIconPNG is a programmatically generated 22x22 template PNG.
// Black on transparent — macOS recolors it for dark/light mode automatically.
// Draws a conductor's baton: a diagonal wand with a round handle.
var trayIconPNG []byte

// trayIconICO wraps trayIconPNG in a minimal ICO container. Windows requires
// ICO format for system-tray icons; fyne.io/systray's SetIcon on Windows
// parses this directly.
var trayIconICO []byte

func init() {
	const size = 22
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	// Use white with a subtle border so the icon is visible on both light
	// and dark taskbars on Windows. macOS ignores the color and recolors
	// based on the alpha channel (template image behavior).
	fg := color.NRGBA{255, 255, 255, 255}

	// Handle: rounded blob at lower-left (where the conductor grips the baton)
	for _, p := range [][2]int{
		{3, 16}, {4, 16}, {5, 16},
		{2, 17}, {3, 17}, {4, 17}, {5, 17},
		{2, 18}, {3, 18}, {4, 18}, {5, 18},
		{3, 19}, {4, 19},
	} {
		img.SetNRGBA(p[0], p[1], fg)
	}

	// Stick: 2px-wide diagonal line from handle to upper-right tip
	for i := 0; i <= 11; i++ {
		setThick(img, 5+i, 16-i, fg)
	}

	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	trayIconPNG = buf.Bytes()
	trayIconICO = pngToICO(trayIconPNG, size, size)
}

// setThick draws a 2px-wide point for visibility at menu bar size.
func setThick(img *image.NRGBA, x, y int, c color.NRGBA) {
	img.SetNRGBA(x, y, c)
	img.SetNRGBA(x+1, y, c)
}

// pngToICO wraps PNG image bytes in a single-entry ICO container. ICO files
// containing PNG data are supported by Windows Vista+.
func pngToICO(pngBytes []byte, width, height int) []byte {
	// ICO header: 6 bytes + 16-byte entry = 22 bytes of header.
	const headerSize = 6 + 16
	buf := new(bytes.Buffer)
	// ICONDIR header
	_ = binary.Write(buf, binary.LittleEndian, uint16(0)) // reserved
	_ = binary.Write(buf, binary.LittleEndian, uint16(1)) // type: 1 = icon
	_ = binary.Write(buf, binary.LittleEndian, uint16(1)) // count
	// ICONDIRENTRY — width/height are 1 byte each, 0 means 256.
	w := byte(width)
	h := byte(height)
	if width >= 256 {
		w = 0
	}
	if height >= 256 {
		h = 0
	}
	buf.WriteByte(w)                                              // width
	buf.WriteByte(h)                                              // height
	buf.WriteByte(0)                                              // colors (0 = no palette)
	buf.WriteByte(0)                                              // reserved
	_ = binary.Write(buf, binary.LittleEndian, uint16(1))         // color planes
	_ = binary.Write(buf, binary.LittleEndian, uint16(32))        // bits per pixel
	_ = binary.Write(buf, binary.LittleEndian, uint32(len(pngBytes))) // size
	_ = binary.Write(buf, binary.LittleEndian, uint32(headerSize))    // offset
	buf.Write(pngBytes)
	return buf.Bytes()
}
