/** @jsx jsx */
import { PlayKey } from "@dolphin/types";
import { css, jsx } from "@emotion/react";
import Avatar from "@material-ui/core/Avatar";
import CircularProgress from "@material-ui/core/CircularProgress";
import { colors } from "common/colors";
import crypto from "crypto";
import firebase from "firebase";
import React from "react";

export const UserInfo: React.FC<{
  user: firebase.User;
  playKey: PlayKey | null;
  loading: boolean;
}> = ({ user, playKey, loading }) => {
  const hexString = crypto.createHash("md5").update(user.uid).digest("hex");
  const imageUrl = `https://www.gravatar.com/avatar/${hexString}?d=identicon`;
  return (
    <div
      css={css`
        display: flex;
        align-items: center;
        color: white;

        @media (min-width: 800px) {
          min-width: 250px;
        }
      `}
    >
      {loading ? (
        <CircularProgress color="inherit" />
      ) : (
        <Avatar
          src={imageUrl}
          css={css`
            border: solid 3px ${colors.purpleLight};
            height: 38px;
            width: 38px;
          `}
        />
      )}
      <div
        css={css`
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          margin-left: 10px;

          @media (max-width: 800px) {
            display: none;
          }

          h3 {
            margin: 0;
            margin-bottom: 6px;
            font-size: 18px;
          }
        `}
      >
        <h3>{user.displayName}</h3>
        {!loading && (
          <div
            css={css`
              font-weight: bold;
              font-size: 14px;
              color: ${playKey ? colors.purpleLight : "red"};
            `}
          >
            {playKey ? playKey.connectCode : "Online activation required"}
          </div>
        )}
      </div>
    </div>
  );
};