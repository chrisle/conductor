package main

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
)

// trayIconBytes is a programmatically generated 22x22 template PNG.
// Black on transparent — macOS recolors it for dark/light mode automatically.
// Draws a conductor's baton: a diagonal wand with a round handle.
var trayIconBytes []byte

func init() {
	const size = 22
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	c := color.NRGBA{0, 0, 0, 255}

	// Handle: rounded blob at lower-left (where the conductor grips the baton)
	for _, p := range [][2]int{
		{3, 16}, {4, 16}, {5, 16},
		{2, 17}, {3, 17}, {4, 17}, {5, 17},
		{2, 18}, {3, 18}, {4, 18}, {5, 18},
		{3, 19}, {4, 19},
	} {
		img.SetNRGBA(p[0], p[1], c)
	}

	// Stick: 2px-wide diagonal line from handle to upper-right tip
	for i := 0; i <= 11; i++ {
		setThick(img, 5+i, 16-i, c)
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
