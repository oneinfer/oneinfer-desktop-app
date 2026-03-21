import { saveMachineDetails } from '../api';
import type { DesktopSession, MachineDetailsItem } from '../types';

type NativeMachinePayload = Record<string, unknown>;

export async function collectLocalMachineDetails(): Promise<NativeMachinePayload | null> {
  if (!window.desktopBridge?.getMachineDetails) {
    return null;
  }

  return window.desktopBridge.getMachineDetails();
}

export async function syncLocalMachineProfile(
  currentBaseUrl: string,
  currentSession: DesktopSession,
): Promise<MachineDetailsItem | null> {
  if (window.desktopBridge?.syncMachineDetails) {
    try {
      console.log('[machine-sync] invoking main-process sync');
      return await window.desktopBridge.syncMachineDetails({
        baseUrl: currentBaseUrl,
        session: currentSession,
      }) as MachineDetailsItem;
    } catch (error) {
      console.error('Main-process machine sync failed, falling back to renderer sync.', error);
    }
  }

  const localMachineDetails = await collectLocalMachineDetails();

  if (localMachineDetails) {
    console.log('[machine-sync] falling back to renderer sync');
    return saveMachineDetails(currentBaseUrl, currentSession, localMachineDetails);
  }

  throw new Error('Desktop bridge is not available. Run the Electron desktop app with npm run dev or the packaged desktop build. Browser mode cannot read local hardware details.');
}