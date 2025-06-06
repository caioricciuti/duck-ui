// src/pages/NotFound.tsx
import React from "react";
import Logo from "/logo.png";
import LogoLight from "/logo-light.png";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router";
import { SignpostBig } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";

const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex w-full h-screen">
      <div className="flex items-center m-auto">
        {useTheme().theme === "light" ? (
          <img
            src={LogoLight.toString()}
            alt="Logo"
            className="h-18 w-22 m-auto mb-8 pl-24 hidden sm:block"
          />
        ) : (
          <img
            src={Logo.toString()}
            alt="Logo"
            className="h-18 w-22 m-auto mb-8 pl-24 hidden sm:block"
          />
        )}
        <Separator orientation="vertical" className="p-0.5 h-32 mr-6 ml-4" />
        <div>
          <h1 className="font-semibold text-2xl">404 - Page Not Found</h1>
          <p className="text-primary/60">
            Sorry, the page you are looking for does not exist.
          </p>
          <Button
            variant="ghost"
            className="mt-4"
            onClick={() => {
              navigate("/");
            }}
          >
            <SignpostBig className="h-8" />
            <span className="ml-4">Take me home!</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
