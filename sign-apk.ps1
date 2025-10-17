$apkSigner = "$env:ANDROID_HOME\build-tools\35.0.0\apksigner.bat"
$keystore = "$env:USERPROFILE\.android\debug.keystore"
$inputApk = "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk"
$outputApk = "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-signed.apk"

Write-Host "Signing APK..."
& $apkSigner sign `
    --ks $keystore `
    --ks-pass pass:android `
    --key-pass pass:android `
    --ks-key-alias androiddebugkey `
    --out $outputApk `
    $inputApk

if ($LASTEXITCODE -eq 0) {
    Write-Host "APK signed successfully: $outputApk" -ForegroundColor Green
    Write-Host "File size: $((Get-Item $outputApk).Length / 1MB) MB"
} else {
    Write-Host "Failed to sign APK" -ForegroundColor Red
    exit 1
}
