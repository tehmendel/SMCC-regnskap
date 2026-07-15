$f = "src/version.json"
$current = (([System.IO.File]::ReadAllText($f) | ConvertFrom-Json).version) -replace ',', '.'
$inv = [System.Globalization.CultureInfo]::InvariantCulture
$nextFloat = [Math]::Round([double]::Parse($current, $inv) + 0.001, 3)
$next = $nextFloat.ToString("0.000", $inv)
[System.IO.File]::WriteAllText($f, "{`"version`": `"$next`"}`n", [System.Text.Encoding]::UTF8)
git add $f
git commit -m "chore: bump version to v$next"
git push
Write-Host ""
Write-Host "Versjon: v$next" -ForegroundColor Green
