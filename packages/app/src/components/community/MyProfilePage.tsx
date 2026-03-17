import Button from '@atlaskit/button';
import { Field } from '@atlaskit/form';
import TextField from '@atlaskit/textfield';
import { useQuery } from '@tanstack/react-query';
import { type ChangeEvent, type FC, useState, useEffect, type FormEvent } from 'react';
import { toast } from 'react-toastify';
import { fetchCommunity } from '../../utils/getCommunityApi';
import { getProfileResponseChecker, type PutProfileBody } from '../../utils/communityApi';
import { css } from '@emotion/react';
import { useHandledMutation } from '../../hooks/useHandledMutation';

const styles = css`
  .actions {
    margin-top: 16px;
    display: flex;
    gap: 16px;
  }
`;

export const MyProfilePage: FC = () => {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');

  const { data } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => fetchCommunity('/profile', getProfileResponseChecker),
  });

  useEffect(() => {
    if (!data) return;

    setUsername(data.user.username);
    setDisplayName(data.user.displayName);
    setEmail(data.user.email);
  }, [data]);

  const saveProfileChanges = useHandledMutation({
    mutationFn: async (_variables: void) => {
      const response = await fetchCommunity('/profile', getProfileResponseChecker, {
        method: 'PUT',
        body: JSON.stringify({
          username,
          displayName,
          email,
        } satisfies PutProfileBody),
      });

      return response;
    },
    errorMessage: 'Failed to save profile changes',
    metadata: {
      username,
      displayName,
      email,
    },
    onSuccess: () => {
      toast.info('Profile changes saved.');
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (saveProfileChanges.isPending) {
      return;
    }

    saveProfileChanges.mutate(undefined);
  };

  return (
    <div css={styles}>
      <h1>My Profile</h1>
      <form onSubmit={handleSubmit}>
        <Field name="username" label="Username">
          {() => (
            <TextField
              name="username"
              placeholder="Username"
              value={username}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
            />
          )}
        </Field>
        <Field name="displayName" label="Display Name">
          {() => (
            <TextField
              name="displayName"
              placeholder="Display Name"
              value={displayName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
            />
          )}
        </Field>
        <Field name="email" label="Email">
          {() => (
            <TextField
              name="email"
              placeholder="Email"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <div className="actions">
          <Button appearance="primary" type="submit" isDisabled={saveProfileChanges.isPending}>
            Save
          </Button>
        </div>
      </form>
    </div>
  );
};
