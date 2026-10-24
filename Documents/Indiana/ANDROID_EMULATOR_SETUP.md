# Android Emulator Setup

## Machine setup completed

- Project Expo version: `58.0.17` (React Native `0.88.0`). SDK 58 uses Android compile SDK 37.
- Android Studio was already installed at `C:\Program Files\Android\Android Studio`.
- Android command-line tools were installed under `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest`.
- User environment variable `ANDROID_HOME` is set to `%LOCALAPPDATA%\Android\Sdk`.
- User `PATH` now includes the SDK's `platform-tools`, `emulator`, and `cmdline-tools\latest\bin` folders. Open a new terminal (or restart VS Code) to load these changes.
- Installed Android SDK Build-Tools `37.0.0` and the Android 37.0 platform.
- Installed the Android 37.2 Google APIs x86_64 16 KB page-size system image and updated the Emulator package to `37.2.12.0`.
- Windows Hypervisor Platform acceleration (WHPX) was detected and reported usable.

## Virtual device and Expo launch

- Created AVD: `Expo_Pixel_10_API_37` (Pixel 10 profile, Android 37.2, x86_64).
- ADB identified it as `emulator-5554` and reported it online after boot.
- Ran `npx expo start --android` from the project root. Expo Go was installed on the AVD, and Metro served the project at `http://localhost:8081`.
- Metro completed the first bundle: 1,433 modules in about 96 seconds.

To start the project again from a new terminal:

```powershell
npx expo start --android
```

Expo's [SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/) lists compile SDK 37, and its [Android Studio Emulator guide](https://docs.expo.dev/workflow/android-studio-emulator/) covers the Android tooling and AVD workflow.

## First-boot note

The last emulator screenshot showed a **System UI isn't responding** prompt while Expo Go displayed 37% bundling. Metro later reported the bundle complete, but the prompt was left untouched after Computer Use was stopped with Escape. If it is still visible, choose **Wait** and give the emulator time to recover. No app source files or Expo configuration were changed for this setup.
