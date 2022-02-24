import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RoleEnrollmentStatus, selectClaimsService, selectRole, Web3ActionTypes } from '../../../redux-store';

export const useNotSyncedEffects = () => {
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const role = useSelector(selectRole);
  const claimsService = useSelector(selectClaimsService);

  const onAddRole = async () => {
    if (!role) {
      dispatch({
        type: Web3ActionTypes.UPDATE_ROLE_ENROLLMENT_STATUS,
        payload: RoleEnrollmentStatus.NOT_ENROLLED,
      });
    }
    setIsLoading(true);
    try {
      await claimsService.registerOnchain({
        token: role.token,
        subjectAgreement: role.subjectAgreement,
        onChainProof: role.onChainProof,
        acceptedBy: role.acceptedBy,
      });
      dispatch({
        type: Web3ActionTypes.UPDATE_ROLE_ENROLLMENT_STATUS,
        payload: RoleEnrollmentStatus.ENROLLED_SYNCED,
      });
      setIsLoading(false);
    } catch (error) {
      dispatch({
        type: Web3ActionTypes.SET_WEB3_FAILURE,
        payload: error,
      });
      setIsLoading(false);
    }
  };

  return { onAddRole, isLoading };
};
