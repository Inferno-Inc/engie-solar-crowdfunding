import { isMetamaskExtensionPresent, ProviderType } from 'iam-client-lib';
import { DSLAModalsActionsEnum } from '../../context';
import { TDSLAModalsAction, Web3ModalConfig } from '../../context/modals/types';
import { getIamService } from '../../context/iam';
import { setListeners } from '../../context/iam/setListeners';
import { AppThunk } from '../store';
import {
  getFromStorage,
  getLocalStorageAccount,
  PROVIDER_TYPE,
  removeLocalStorageAccount,
  setLocalStorageAccount,
} from '../localStorage';
import { RoleEnrollmentStatus, UpdateWeb3Payload, Web3ActionTypes } from './types';

export const setIsLoading = (payload: boolean) => ({
  type: Web3ActionTypes.SET_IS_LOADING,
  payload,
});

export const setStateSuccess = (payload: UpdateWeb3Payload) => ({
  type: Web3ActionTypes.SET_WEB3_SUCCESS,
  payload,
});

export const setStateFailure = (payload: string) => ({
  type: Web3ActionTypes.SET_WEB3_FAILURE,
  payload,
});

export const resetState = () => ({
  type: Web3ActionTypes.RESET_WEB3,
});

export const updateRoleEnrollmentStatus = (payload: RoleEnrollmentStatus) => ({
  type: Web3ActionTypes.UPDATE_ROLE_ENROLLMENT_STATUS,
  payload,
});

export const requestLogout =
  (): AppThunk =>
  async (dispatch): Promise<void> => {
    removeLocalStorageAccount();
    dispatch(resetState());
    window.location.reload();
  };

export const handleWeb3Listeners =
  (signerService, dispatchModals: React.Dispatch<TDSLAModalsAction>): AppThunk =>
  async (dispatch): Promise<void> => {
    const handleListeners = (config: Web3ModalConfig) => {
      dispatchModals({
        type: DSLAModalsActionsEnum.SHOW_NOTIFICATION,
        payload: {
          open: true,
          config,
        },
      });
      removeLocalStorageAccount();
      dispatch({ type: Web3ActionTypes.RESET_WEB3 });
    };
    setListeners(signerService, (config) => handleListeners(config));
  };

export const getWeb3 =
  (dispatchModals: React.Dispatch<TDSLAModalsAction>): AppThunk =>
  async (dispatch): Promise<void> => {
    const providerType = await getFromStorage(PROVIDER_TYPE);
    const initialStorageValues: UpdateWeb3Payload = getLocalStorageAccount();
    const { isMetamaskPresent, chainId: browserChainId } = await isMetamaskExtensionPresent();
    const isConnectedToRightNetwork =
      process.env.NEXT_PUBLIC_CHAIN_ID.toString() === parseInt(`${browserChainId}`, 16)?.toString();

    if (providerType) {
      try {
        dispatch({
          type: Web3ActionTypes.SET_IS_LOADING,
          payload: true,
        });
        const { signerService, roleEnrolmentStatus } = await getIamService(providerType as ProviderType);

        if (signerService && roleEnrolmentStatus) {
          dispatch(handleWeb3Listeners(signerService, dispatchModals));
          dispatch({
            type: Web3ActionTypes.SET_WEB3_SUCCESS,
            payload: {
              ...initialStorageValues,
              isLoading: false,
              address: signerService?.address,
              providerType: signerService?.providerType,
              chainId: signerService?.chainId,
              provider: signerService?.provider,
              signer: signerService?.signer,
              did: signerService?.did,
              authenticated: Boolean(signerService?.address) && Boolean(signerService?.providerType),
              roleEnrolmentStatus,
              isEthSigner: signerService?.isEthSigner?.toString(),
              isMetamaskPresent,
              isConnectedToRightNetwork,
            },
          });
        }
      } catch (error) {
        dispatch({
          type: Web3ActionTypes.SET_IS_LOADING,
          payload: false,
        });
        dispatch({
          type: Web3ActionTypes.SET_WEB3_FAILURE,
          payload: error,
        });
      }
    } else {
      dispatch({
        type: Web3ActionTypes.SET_WEB3_SUCCESS,
        payload: {
          ...initialStorageValues,
          isLoading: false,
          isMetamaskPresent,
          isConnectedToRightNetwork,
        },
      });
    }
  };

export const requestLogin =
  (providerType: ProviderType, dispatchModals: React.Dispatch<TDSLAModalsAction>): AppThunk =>
  async (dispatch): Promise<void> => {
    dispatch({
      type: Web3ActionTypes.SET_IS_LOADING,
      payload: true,
    });
    try {
      const { signerService, roleEnrolmentStatus } = await getIamService(providerType);
      const { isMetamaskPresent, chainId: browserChainId } = await isMetamaskExtensionPresent();
      const isConnectedChainId =
        process.env.NEXT_PUBLIC_CHAIN_ID.toString() === parseInt(`${browserChainId}`, 16)?.toString();
      const publicKey = await signerService.publicKey();
      if (signerService?.signer && signerService?.address) {
        dispatch(handleWeb3Listeners(signerService, dispatchModals));

        const payload = {
          address: signerService?.address,
          providerType: signerService?.providerType,
          chainId: signerService?.chainId,
          provider: signerService?.provider,
          signer: signerService?.signer,
          did: signerService?.did,
          authenticated: Boolean(signerService?.address) && Boolean(signerService?.providerType),
          publicKey,
          roleEnrolmentStatus,
          isEthSigner: signerService?.isEthSigner?.toString(),
        };
        setLocalStorageAccount(payload);

        dispatch({
          type: Web3ActionTypes.SET_WEB3_SUCCESS,
          payload: {
            ...payload,
            isLoading: false,
            isMetamaskPresent,
            isConnectedChainId,
          },
        });
      }
    } catch (error) {
      dispatch({
        type: Web3ActionTypes.SET_WEB3_FAILURE,
        payload: error,
      });
    }
  };

export const cancelEnrollment =
  (): AppThunk =>
  async (dispatch): Promise<void> => {
    const providerType = await getFromStorage(PROVIDER_TYPE);
    try {
      const { signerService, role } = await getIamService(providerType as ProviderType);
      if (signerService?.signer && signerService?.address) {
        console.log('ROLE: ', role);
        if (!role) {
          dispatch({
            type: Web3ActionTypes.UPDATE_ROLE_ENROLLMENT_STATUS,
            payload: RoleEnrollmentStatus.NOT_ENROLLED,
          });
        }
        dispatch(deleteClaim(role.id));
      }
    } catch (error) {
      dispatch({
        type: Web3ActionTypes.SET_WEB3_FAILURE,
        payload: error,
      });
    }
  };

export const deleteClaim =
  (id: string): AppThunk =>
  async (dispatch): Promise<void> => {
    const providerType = await getFromStorage(PROVIDER_TYPE);
    try {
      const { claimsService } = await getIamService(providerType as ProviderType);
      if (claimsService) {
        await claimsService.deleteClaim({ id });
        dispatch({
          type: Web3ActionTypes.UPDATE_ROLE_ENROLLMENT_STATUS,
          payload: RoleEnrollmentStatus.NOT_ENROLLED,
        });
      }
    } catch (error) {
      dispatch({
        type: Web3ActionTypes.SET_WEB3_FAILURE,
        payload: error,
      });
    }
  };

export const addRole =
  (): AppThunk =>
  async (dispatch): Promise<void> => {
    const providerType = await getFromStorage(PROVIDER_TYPE);
    try {
      const { claimsService, role } = await getIamService(providerType as ProviderType);
      if (claimsService && role) {
        if (!role) {
          dispatch({
            type: Web3ActionTypes.UPDATE_ROLE_ENROLLMENT_STATUS,
            payload: RoleEnrollmentStatus.NOT_ENROLLED,
          });
        }
        await claimsService.registerOnchain(role);
        dispatch({
          type: Web3ActionTypes.UPDATE_ROLE_ENROLLMENT_STATUS,
          payload: RoleEnrollmentStatus.ENROLLED_SYNCED,
        });
      }
    } catch (error) {
      dispatch({
        type: Web3ActionTypes.SET_WEB3_FAILURE,
        payload: error,
      });
    }
  };
