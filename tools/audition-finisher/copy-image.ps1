param(
    [Parameter(Mandatory = $true)]
    [string]$ImagePath
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$image = [System.Drawing.Image]::FromFile($ImagePath)
try {
    for ($attempt = 0; $attempt -lt 10; $attempt += 1) {
        try {
            [System.Windows.Forms.Clipboard]::SetImage($image)
            exit 0
        }
        catch {
            Start-Sleep -Milliseconds 200
        }
    }
    throw "The image clipboard is busy."
}
finally {
    $image.Dispose()
}
