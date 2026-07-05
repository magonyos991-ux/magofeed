Add-Type -AssemblyName System.Drawing

function New-LogoBitmap([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

  $bgDark  = [System.Drawing.Color]::FromArgb(255, 26, 23, 20)   # #1a1714
  $bgLight = [System.Drawing.Color]::FromArgb(255, 42, 36, 30)   # subtle lighter center
  $cream   = [System.Drawing.Color]::FromArgb(255, 244, 242, 238) # #f4f2ee
  $goldOut = [System.Drawing.Color]::FromArgb(255, 154, 114, 40)  # #9a7228
  $goldIn  = [System.Drawing.Color]::FromArgb(255, 232, 196, 122) # #e8c47a

  # Fond degrade radial subtil (centre plus clair, bords plus sombres) plutot qu'un aplat plat
  $bgRect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
  $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bgPath.AddEllipse(-$size*0.3, -$size*0.3, $size*1.6, $size*1.6)
  $bgBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($bgPath)
  $bgBrush.CenterColor = $bgLight
  $bgBrush.SurroundColors = @($bgDark)
  $g.FillRectangle($bgBrush, $bgRect)

  # scale viewBox 0..86 into a centered square with padding
  $pad = $size * 0.14
  $draw = $size - 2 * $pad
  $scale = $draw / 86.0
  $ox = $pad
  $oy = $pad

  function P([double]$x, [double]$y) {
    New-Object System.Drawing.PointF (($ox + $x * $scale), ($oy + $y * $scale))
  }

  function BuildMPath([double]$offsetX, [double]$offsetY) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $cur = New-Object System.Drawing.PointF (((P 10 74).X)+$offsetX), (((P 10 74).Y)+$offsetY)
    function Pt($x,$y){ New-Object System.Drawing.PointF (((P $x $y).X)+$offsetX), (((P $x $y).Y)+$offsetY) }
    function QuadTo($cur, $qx, $qy, $ex, $ey) {
      $p0 = $cur; $q = Pt $qx $qy; $p2 = Pt $ex $ey
      $c1x = $p0.X + (2.0/3.0) * ($q.X - $p0.X); $c1y = $p0.Y + (2.0/3.0) * ($q.Y - $p0.Y)
      $c2x = $p2.X + (2.0/3.0) * ($q.X - $p2.X); $c2y = $p2.Y + (2.0/3.0) * ($q.Y - $p2.Y)
      $path.AddBezier($p0.X, $p0.Y, $c1x, $c1y, $c2x, $c2y, $p2.X, $p2.Y)
      return $p2
    }
    function LineTo($cur, $ex, $ey) {
      $p2 = Pt $ex $ey
      $path.AddLine($cur.X, $cur.Y, $p2.X, $p2.Y)
      return $p2
    }
    $cur = LineTo $cur 10 20
    $cur = QuadTo $cur 10 12 18 12
    $cur = QuadTo $cur 24 12 27 20
    $cur = LineTo $cur 43 52
    $cur = LineTo $cur 59 20
    $cur = QuadTo $cur 62 12 68 12
    $cur = QuadTo $cur 76 12 76 20
    $cur = LineTo $cur 76 74
    $cur = QuadTo $cur 76 80 70 80
    $cur = QuadTo $cur 64 80 64 74
    $cur = LineTo $cur 64 44
    $cur = LineTo $cur 51 66
    $cur = QuadTo $cur 48 72 43 72
    $cur = QuadTo $cur 38 72 35 66
    $cur = LineTo $cur 22 44
    $cur = LineTo $cur 22 74
    $cur = QuadTo $cur 22 80 16 80
    $cur = QuadTo $cur 10 80 10 74
    $path.CloseFigure()
    return $path
  }

  # Ombre portee douce (plusieurs copies decalees en opacite decroissante, faute de flou gaussien natif)
  $shadowOffset = $scale * 2.2
  for ($i = 4; $i -ge 1; $i--) {
    $alpha = [int](10 * $i)
    $shadowPath = BuildMPath ($shadowOffset * $i / 4.0) ($shadowOffset * $i / 4.0)
    $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($alpha, 0, 0, 0))
    $g.FillPath($shadowBrush, $shadowPath)
  }

  $mainPath = BuildMPath 0 0
  $creamBrush = New-Object System.Drawing.SolidBrush $cream
  $g.FillPath($creamBrush, $mainPath)

  # Gold dot at (43,9) avec halo lumineux doux derriere
  $c = P 43 9
  $r7 = 7 * $scale
  $r35 = 3.5 * $scale
  $r18 = 1.8 * $scale

  for ($i = 3; $i -ge 1; $i--) {
    $glowR = $r7 * (1 + 0.35 * $i)
    $glowAlpha = [int](18 - $i * 4)
    $glowRect = New-Object System.Drawing.RectangleF ($c.X - $glowR), ($c.Y - $glowR), (2*$glowR), (2*$glowR)
    $glowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($glowAlpha, 232, 196, 122))
    $g.FillEllipse($glowBrush, $glowRect)
  }

  $rectOuter = New-Object System.Drawing.RectangleF ($c.X - $r7), ($c.Y - $r7), (2*$r7), (2*$r7)
  $goldBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rectOuter, $goldIn, $goldOut, 45)
  $g.FillEllipse($goldBrush, $rectOuter)

  $rectMid = New-Object System.Drawing.RectangleF ($c.X - $r35), ($c.Y - $r35), (2*$r35), (2*$r35)
  $darkBrush = New-Object System.Drawing.SolidBrush $bgDark
  $g.FillEllipse($darkBrush, $rectMid)

  $rectIn = New-Object System.Drawing.RectangleF ($c.X - $r18), ($c.Y - $r18), (2*$r18), (2*$r18)
  $goldBrush2 = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rectIn, $goldIn, $goldOut, 45)
  $g.FillEllipse($goldBrush2, $rectIn)

  $g.Dispose()
  return $bmp
}

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$path) {
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

$root = "C:\Users\ilias\Desktop\magofeed\icons"

function Save-PngNoLock([System.Drawing.Bitmap]$bmp, [string]$finalPath) {
  $tmp = $finalPath + ".new"
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
  $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  if (Test-Path $finalPath) {
    try { Remove-Item $finalPath -Force -ErrorAction Stop }
    catch { Write-Output "Could not remove old $finalPath, leaving .new next to it: $($_.Exception.Message)"; return }
  }
  Rename-Item $tmp (Split-Path $finalPath -Leaf)
}

$b512 = New-LogoBitmap 512
Save-PngNoLock $b512 (Join-Path $root "icon-512.png")

$b192 = New-LogoBitmap 192
Save-PngNoLock $b192 (Join-Path $root "icon-192.png")

$b180 = New-LogoBitmap 180
Save-PngNoLock $b180 (Join-Path $root "apple-touch-icon.png")

$b32 = New-LogoBitmap 32
Save-PngNoLock $b32 (Join-Path $root "favicon-32.png")

# Maskable variant: same design already has generous padding so it's safe-zone friendly.
Copy-Item (Join-Path $root "icon-512.png") (Join-Path $root "icon-512-maskable.png") -Force
Copy-Item (Join-Path $root "icon-192.png") (Join-Path $root "icon-192-maskable.png") -Force

Write-Output "Icons generated in $root"
