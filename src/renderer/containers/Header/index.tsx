/** @jsx jsx */
import { launchNetplayDolphin } from "@dolphin/ipc";
import { css, jsx } from "@emotion/react";
import styled from "@emotion/styled";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import ButtonBase from "@material-ui/core/ButtonBase";
import IconButton from "@material-ui/core/IconButton";
import SnackbarContent from "@material-ui/core/SnackbarContent";
import Tooltip from "@material-ui/core/Tooltip";
import SettingsOutlinedIcon from "@material-ui/icons/SettingsOutlined";
import Alert from "@material-ui/lab/Alert";
import { colors } from "common/colors";
import { slippiActivationUrl, slippiHomepage } from "common/constants";
import { shell } from "electron";
import React from "react";

import { PlayIcon } from "@/components/PlayIcon";
import { useAccount } from "@/lib/hooks/useAccount";
import { useLoginModal } from "@/lib/hooks/useLoginModal";
import { useSettings } from "@/lib/hooks/useSettings";
import { useSettingsModal } from "@/lib/hooks/useSettingsModal";
import { assertPlayKey } from "@/lib/playkey";
import { useApp } from "@/store/app";
import slippiLogo from "@/styles/images/slippi-logo.svg";

import { MainMenu, MenuItem } from "./MainMenu";
import { UserMenu } from "./UserMenu";

const handleError = (error: any) => {
  const { showSnackbar, dismissSnackbar } = useApp.getState();
  const message = error.message || JSON.stringify(error);
  showSnackbar(
    <Alert onClose={dismissSnackbar} severity="error">
      {message}
    </Alert>,
  );
};

const OuterBox = styled(Box)`
  background: radial-gradient(circle at left, #5c1394, transparent 30%);
  background-color: ${colors.purple};
  height: 70px;
`;

const SelectMeleeIsoSnackBar: React.FC<{
  onSettingsClick: () => void;
}> = ({ onSettingsClick }) => {
  return (
    <SnackbarContent
      message={"Please set your Melee ISO path."}
      action={
        <Button color="secondary" size="small" onClick={onSettingsClick}>
          Open Settings
        </Button>
      }
    />
  );
};

const EnableOnlineSnackBar: React.FC = () => {
  return (
    <SnackbarContent
      message={"Please configure your online connect code."}
      action={
        <Button color="secondary" size="small" onClick={() => shell.openExternal(slippiActivationUrl)}>
          Configure
        </Button>
      }
    />
  );
};

export interface HeaderProps {
  path: string;
  menuItems: MenuItem[];
}

export const Header: React.FC<HeaderProps> = ({ path, menuItems }) => {
  const openModal = useLoginModal((store) => store.openModal);
  const { open } = useSettingsModal();
  const currentUser = useAccount((store) => store.user);
  const meleeIsoPath = useSettings((store) => store.settings.isoPath) || undefined;
  const showSnackbar = useApp((state) => state.showSnackbar);
  const dismissSnackbar = useApp((state) => state.dismissSnackbar);

  const onPlay = async () => {
    if (!meleeIsoPath) {
      // Show notification about ISO path not set and link to settings
      showSnackbar(
        <SelectMeleeIsoSnackBar
          onSettingsClick={() => {
            open("/settings/melee-options");
            dismissSnackbar();
          }}
        />,
      );
      return;
    }

    try {
      await assertPlayKey();
    } catch (err) {
      showSnackbar(<EnableOnlineSnackBar />);
      return;
    }

    const launchResult = await launchNetplayDolphin.renderer!.trigger({});
    if (!launchResult.result) {
      console.error("Error launching netplay dolphin", launchResult.errors);
      handleError("Error launching netplay dolphin");
    }
    return;
  };

  return (
    <OuterBox
      css={css`
        display: flex;
        justify-content: space-between;
      `}
    >
      <div
        css={css`
          display: flex;
          align-items: center;
        `}
      >
        <Tooltip title="Open Slippi homepage">
          <Button onClick={() => shell.openExternal(slippiHomepage)}>
            <img src={slippiLogo} width="43px" />
          </Button>
        </Tooltip>
        {currentUser ? (
          <div
            css={css`
              margin: 0 10px;
            `}
          >
            <ButtonBase onClick={onPlay}>
              <PlayIcon>Play</PlayIcon>
            </ButtonBase>
          </div>
        ) : (
          <Button onClick={openModal}>Log in</Button>
        )}
        <MainMenu path={path} menuItems={menuItems} />
      </div>
      <Box display="flex" alignItems="center">
        {currentUser && <UserMenu user={currentUser} handleError={handleError}></UserMenu>}
        <Tooltip title="Settings">
          <IconButton
            onClick={() => open()}
            css={css`
              opacity: 0.5;
            `}
          >
            <SettingsOutlinedIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </OuterBox>
  );
};