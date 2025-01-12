import AdmZip from "adm-zip";
import { ChildProcessWithoutNullStreams, spawn, spawnSync } from "child_process";
import { app, BrowserWindow } from "electron";
import { download } from "electron-dl";
import extractDmg from "extract-dmg";
import * as fs from "fs-extra";
import os from "os";
import path from "path";
import { lt } from "semver";

import { fileExists } from "../main/fileExists";
import { getLatestRelease } from "../main/github";
import { ipc_dolphinDownloadFinishedEvent, ipc_dolphinDownloadLogReceivedEvent } from "./ipc";
import { DolphinLaunchType } from "./types";
import { findDolphinExecutable } from "./util";

function logDownloadInfo(message: string): void {
  void ipc_dolphinDownloadLogReceivedEvent.main!.trigger({ message });
}

export async function assertDolphinInstallation(
  type: DolphinLaunchType,
  log: (message: string) => void,
): Promise<void> {
  try {
    await findDolphinExecutable(type);
    log(`Found existing ${type} Dolphin executable.`);
    log(`Checking if we need to update ${type} Dolphin`);
    const data = await getLatestReleaseData(type);
    const latestVersion = data.tag_name;
    const isOutdated = await compareDolphinVersion(type, latestVersion);
    if (isOutdated) {
      log(`${type} Dolphin installation is outdated. Downloading latest...`);
      await downloadAndInstallDolphin(type, log);
      return;
    }
    log("No update found...");
    return;
  } catch (err) {
    log(`Could not find ${type} Dolphin installation. Downloading...`);
    await downloadAndInstallDolphin(type, log);
  }
}

export async function downloadAndInstallDolphin(
  type: DolphinLaunchType,
  log: (message: string) => void,
  cleanInstall = false,
): Promise<void> {
  const downloadedAsset = await downloadLatestDolphin(type, log);
  log(`Installing ${type} Dolphin...`);
  await installDolphin(type, downloadedAsset, log, cleanInstall);
  log(`Finished ${type} installing`);
}

export async function assertDolphinInstallations(): Promise<void> {
  try {
    await assertDolphinInstallation(DolphinLaunchType.NETPLAY, logDownloadInfo);
    await assertDolphinInstallation(DolphinLaunchType.PLAYBACK, logDownloadInfo);
    await ipc_dolphinDownloadFinishedEvent.main!.trigger({ error: null });
  } catch (err) {
    console.error(err);
    await ipc_dolphinDownloadFinishedEvent.main!.trigger({ error: err.message });
  }
  return;
}

async function compareDolphinVersion(type: DolphinLaunchType, latestVersion: string): Promise<boolean> {
  const dolphinPath = await findDolphinExecutable(type);
  const dolphinVersion = spawnSync(dolphinPath, ["--version"]).stdout.toString();
  return lt(dolphinVersion, latestVersion);
}

export async function openDolphin(type: DolphinLaunchType, params?: string[]): Promise<ChildProcessWithoutNullStreams> {
  const dolphinPath = await findDolphinExecutable(type);
  return spawn(dolphinPath, params);
}

async function getLatestDolphinAsset(type: DolphinLaunchType): Promise<any> {
  const release = await getLatestReleaseData(type);
  const asset = release.assets.find((a: any) => matchesPlatform(a.name));
  if (!asset) {
    throw new Error(`No release asset matched the current platform: ${process.platform}`);
  }
  return asset;
}

async function getLatestReleaseData(type: DolphinLaunchType): Promise<any> {
  const owner = "project-slippi";
  let repo = "Ishiiruka";
  if (type === DolphinLaunchType.PLAYBACK) {
    repo += "-Playback";
  }
  return getLatestRelease(owner, repo);
}

function matchesPlatform(releaseName: string): boolean {
  switch (process.platform) {
    case "win32":
      return releaseName.endsWith("Win.zip");
    case "darwin":
      return releaseName.endsWith("Mac.dmg");
    case "linux":
      return releaseName.endsWith("Linux.zip");
    default:
      return false;
  }
}

async function downloadLatestDolphin(
  type: DolphinLaunchType,
  log: (status: string) => void = console.log,
): Promise<string> {
  const asset = await getLatestDolphinAsset(type);
  const downloadDir = path.join(app.getPath("userData"), "temp");
  await fs.ensureDir(downloadDir);
  const downloadLocation = path.join(downloadDir, asset.name);
  const exists = await fileExists(downloadLocation);
  if (!exists) {
    log(`Downloading ${asset.browser_download_url} to ${downloadLocation}`);
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      await download(win, asset.browser_download_url, {
        filename: asset.name,
        directory: downloadDir,
        onProgress: (progress) => log(`Downloading... ${(progress.percent * 100).toFixed(0)}%`),
      });
      log(`Successfully downloaded ${asset.browser_download_url} to ${downloadLocation}`);
    } else {
      log("I dunno how we got here, but apparently there isn't a browser window /shrug");
    }
  } else {
    log(`${downloadLocation} already exists. Skipping download.`);
  }
  return downloadLocation;
}

async function installDolphin(
  type: DolphinLaunchType,
  assetPath: string,
  log: (message: string) => void,
  cleanInstall = false,
) {
  const dolphinPath = path.join(app.getPath("userData"), type);

  if (cleanInstall) {
    await fs.remove(dolphinPath);
  }

  switch (process.platform) {
    case "win32": {
      // don't need to backup user files since our zips don't contain them
      // and the overwrite won't make them disappear.
      log(`Extracting to: ${dolphinPath}`);
      const zip = new AdmZip(assetPath);
      zip.extractAllTo(dolphinPath, true);
      break;
    }
    case "darwin": {
      const backupLocation = dolphinPath + "_old";
      const dolphinResourcesPath = path.join(dolphinPath, "Slippi Dolphin.app", "Contents", "Resources");

      const alreadyInstalled = await fs.pathExists(dolphinResourcesPath);
      if (alreadyInstalled) {
        log(`${dolphinResourcesPath} already exists. Moving...`);
        await fs.move(dolphinPath, backupLocation);
      }

      log(`Extracting to: ${dolphinPath}`);
      await extractDmg(assetPath, dolphinPath);
      await fs.readdir(dolphinPath, (err, files) => {
        if (err) {
          log(err.message);
        }
        if (files) {
          files.forEach(async (file) => {
            if (file !== "Slippi Dolphin.app") {
              try {
                await fs.unlink(path.join(dolphinPath, file));
              } catch (err) {
                fs.removeSync(path.join(dolphinPath, file));
              }
            }
          });
        }
      });
      const binaryLocation = path.join(dolphinPath, "Slippi Dolphin.app", "Contents", "MacOS", "Slippi Dolphin");
      const userInfo = os.userInfo();
      try {
        await fs.chmod(path.join(dolphinPath, "Slippi Dolphin.app"), "777");
        await fs.chown(path.join(dolphinPath, "Slippi Dolphin.app"), userInfo.uid, userInfo.gid);
        await fs.chmod(binaryLocation, "777");
        await fs.chown(binaryLocation, userInfo.uid, userInfo.gid);
      } catch (err) {
        log(`could not chmod/chown ${type} Dolphin\n${err}`);
      }

      // Move backed up User folder and user.json
      if (alreadyInstalled) {
        const oldUserFolder = path.join(backupLocation, "Slippi Dolphin.app", "Contents", "Resources", "User");
        const newUserFolder = path.join(dolphinResourcesPath, "User");

        if (await fs.pathExists(oldUserFolder)) {
          log("moving User folder...");
          await fs.move(oldUserFolder, newUserFolder);
        } else {
          log("no old User folder to move");
        }
        await fs.remove(backupLocation);
      }
      break;
    }
    case "linux": {
      // Delete the existing app image if there is one
      try {
        const dolphinAppImagePath = await findDolphinExecutable(type);
        // Delete the existing app image if it already exists
        if (await fileExists(dolphinAppImagePath)) {
          log(`${dolphinAppImagePath} already exists. Deleting...`);
          await fs.remove(dolphinAppImagePath);
        }
      } catch (err) {
        log("No existing AppImage found");
      }

      if (cleanInstall) {
        const userFolder = type === DolphinLaunchType.NETPLAY ? "SlippiOnline" : "SlippiPlayback";
        await fs.remove(path.join(app.getPath("home"), ".config", userFolder));
      }

      const zip = new AdmZip(assetPath);
      zip.extractAllTo(dolphinPath, true);

      // Make the file executable
      const dolphinAppImagePath = await findDolphinExecutable(type);
      log(`Setting executable permissions...`);
      await fs.chmod(dolphinAppImagePath, "755");
      break;
    }
    default: {
      throw new Error(`Installing Netplay is not supported on this platform: ${process.platform}`);
    }
  }
}
