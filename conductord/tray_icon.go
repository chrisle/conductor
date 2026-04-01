package main

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
)

// trayIconBytes is a programmatically generated 22x22 template PNG.
// Black on transparent — macOS recolors it for dark/light mode automatically.
// Draws a ">_" terminal prompt icon.
var trayIconBytes []byte

func init() {
	const size = 22
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	c := color.NRGBA{0, 0, 0, 255}

	// ">" chevron: top half (3,4)->(10,11), bottom half (10,11)->(3,18)
	for i := 0; i <= 7; i++ {
		setThick(img, 3+i, 4+i, c)
		setThick(img, 10-i, 11+i, c)
	}

	// "_" cursor underline
	for x := 12; x <= 18; x++ {
		img.SetNRGBA(x, 17, c)
		img.SetNRGBA(x, 18, c)
	}

	var buf bytes.Buffer
	png.Encode(&buf, img)
	trayIconBytes = buf.Bytes()
}

// setThick draws a 2px-wide point for visibility at menu bar size.
func setThick(img *image.NRGBA, x, y int, c color.NRGBA) {
	img.SetNRGBA(x, y, c)
	img.SetNRGBA(x+1, y, c)
}
