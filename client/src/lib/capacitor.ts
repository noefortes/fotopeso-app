import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource, CameraPermissionState } from '@capacitor/camera';

export const isNativeApp = (): boolean => {
  return Capacitor.isNativePlatform();
};

export const getPlatform = (): string => {
  return Capacitor.getPlatform();
};

export interface PhotoResult {
  dataUrl: string;
  file?: File;
}

export interface PermissionResult {
  granted: boolean;
  camera: CameraPermissionState;
  photos: CameraPermissionState;
}

export async function checkCameraPermissions(): Promise<PermissionResult> {
  try {
    const status = await Camera.checkPermissions();
    return {
      granted: status.camera === 'granted' || status.camera === 'limited',
      camera: status.camera,
      photos: status.photos,
    };
  } catch (error) {
    console.error('Permission check error:', error);
    return { granted: false, camera: 'denied', photos: 'denied' };
  }
}

export async function requestCameraPermissions(): Promise<PermissionResult> {
  try {
    const permissions = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
    return {
      granted: permissions.camera === 'granted' || permissions.camera === 'limited',
      camera: permissions.camera,
      photos: permissions.photos,
    };
  } catch (error) {
    console.error('Permission request error:', error);
    return { granted: false, camera: 'denied', photos: 'denied' };
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export async function takePhotoNative(source: 'camera' | 'gallery' = 'camera'): Promise<PhotoResult | null> {
  try {
    const permResult = await requestCameraPermissions();
    if (!permResult.granted) {
      throw new Error('Camera permission denied');
    }

    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      correctOrientation: true,
    });

    if (image.dataUrl) {
      const blob = dataUrlToBlob(image.dataUrl);
      const file = new File([blob], `photo-${Date.now()}.${image.format || 'jpeg'}`, {
        type: `image/${image.format || 'jpeg'}`,
      });

      return {
        dataUrl: image.dataUrl,
        file,
      };
    }
    return null;
  } catch (error) {
    console.error('Native camera error:', error);
    throw error;
  }
}
