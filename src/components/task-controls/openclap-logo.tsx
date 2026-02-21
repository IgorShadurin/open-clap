import Image from "next/image";

interface OpenClapLogoProps {
  alt?: string;
  className?: string;
}

const DEFAULT_CLASS_NAME = "h-5 w-5";

export function OpenClapLogo({
  alt = "OpenClap",
  className = DEFAULT_CLASS_NAME,
}: OpenClapLogoProps) {
  return (
    <Image
      alt={alt}
      className={`${className} block flex-shrink-0`}
      height={20}
      src="/openclap-clap.svg"
      width={20}
    />
  );
}
