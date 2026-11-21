export interface UserLocation {
  latitude: number
  longitude: number
  isCurrent: boolean
}

export const DEFAULT_USER_LOCATION: UserLocation = {
  latitude: 39.9216,
  longitude: 32.8517,
  isCurrent: false,
}

export function getUserLocation(): Promise<UserLocation> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(DEFAULT_USER_LOCATION)
      return
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          isCurrent: true,
        }),
      () => resolve(DEFAULT_USER_LOCATION),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 },
    )
  })
}
