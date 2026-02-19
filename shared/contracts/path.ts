export interface ValidatePathRequest {
  path: string;
}

export interface ValidatePathResponse {
  exists: boolean;
  isDirectory: boolean;
  normalizedPath: string;
}

export interface ApiErrorShape {
  details?: string;
  error: {
    code: string;
    message: string;
  };
}
