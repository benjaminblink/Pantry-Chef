#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');

const ANDROID_SDK = process.env.ANDROID_HOME ||
  path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');

const emulatorPath = path.join(ANDROID_SDK, 'emulator', 'emulator.exe');
const adbPath = path.join(ANDROID_SDK, 'platform-tools', 'adb.exe');
const emulatorName = 'Medium_Phone_API_36.1'; // Default emulator name

console.log(`Starting Android emulator: ${emulatorName}...`);
console.log(`SDK location: ${ANDROID_SDK}`);

const emulator = spawn(emulatorPath, ['-avd', emulatorName], {
  detached: true,
  stdio: 'ignore'
});

emulator.unref();

console.log('✓ Emulator starting in background');
console.log('Waiting for device to boot...');

// Wait for device to be ready and run adb reverse
setTimeout(() => {
  try {
    console.log('Running adb reverse tcp:3000 tcp:3000...');
    execSync(`"${adbPath}" reverse tcp:3000 tcp:3000`, { stdio: 'inherit' });
    console.log('✓ ADB reverse successful!');
  } catch (error) {
    console.warn('⚠ ADB reverse failed - device might not be fully booted yet');
    console.warn('Run manually: adb reverse tcp:3000 tcp:3000');
  }
}, 5000);

console.log('Wait 30-60 seconds for it to fully boot, then run: npm run android:dev');
