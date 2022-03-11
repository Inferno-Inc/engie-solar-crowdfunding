// SPDX-License-Identifier: MIT

pragma solidity ^0.8.12;
import "./interfaces/IClaimManager.sol";

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract Staking is ERC20Burnable {
    uint256 public hardCap;
    uint256 public endDate;
    uint256 public totalRewards;
    uint256 public signupEnd;
    uint256 public startDate;
    uint256 public signupStart;
    uint256 public totalStaked;
    bytes32 public serviceRole;
    bytes32 public patronRole;
    address private owner;
    address private rewardProvider;
    uint256 public contributionLimit;
    bool private aborted;
    bool private contractFunded;
    bool private isContractPaused;
    bool private isContractInitialized;
    address public claimManagerAddress;
    uint256 public minRequiredStake;

    mapping(address => uint256) private stakes;
    
    event CampaignAborted(uint256 _timestamp);
    event StatusChanged(string statusType, uint256 date);
    event Funded(address _user, uint256 _amout, uint256 _timestamp);
    event RewardSent(address provider, uint256 amount, uint256 time);
    event Withdrawn(address _user, uint256 _amout, uint256 _timestamp);
    event TokenBurnt(address _user, uint256 _amout, uint256 _timestamp);
    event RefundExceeded(address _sender, uint256 amount, uint256 refunded);
    event StakingPoolInitialized(uint256 initDate, uint256 _startDate, uint256 _endDate);

    modifier initialized(){
        require(isContractInitialized, "Not initialized");
        _;
    }

    modifier activated(){
        require(block.timestamp > startDate && block.timestamp < endDate, "Contract not activated");
        _;
    }
   
    constructor(
        address _claimManager,
        bytes32 _serviceRole,
        bytes32 _patronRole,
        string memory tokenName,
        string memory tokenSymbol
    ) ERC20(tokenName, tokenSymbol) {
        owner = msg.sender;
        claimManagerAddress = _claimManager;
        serviceRole = _serviceRole;
        patronRole = _patronRole;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Must be the admin");
        _;
    }

     modifier paused(){
        require(isContractPaused, "Contract not Paused");
        _;
    }

    modifier notPaused(){
        require(!isContractPaused, "Contract is frozen");
        _;
    }

    modifier belowLimit(){
        require(msg.value > 0, "No EWT provided");
        require(block.timestamp < signupEnd, "Signup Ended");
        require(totalStaked < hardCap, "Hardcap Exceeded");
        require(stakes[msg.sender] < contributionLimit, "Contribution limit reached"); //prevent reentrency
        _;
    }

    modifier sufficientBalance(uint256 amountToWithdraw){
        require(amountToWithdraw > 0, "error: withdraw 0 EWT");
        require(balanceOf(msg.sender) != 0, "No deposit at stake");
        require(balanceOf(msg.sender) >= amountToWithdraw, "Not enough EWT at stake");
        _;
    }

    modifier withdrawsAllowed(){
        require(aborted || block.timestamp < startDate || block.timestamp > endDate, "Withdraws not allowed");
        require(hasRole(msg.sender, patronRole), "No patron role");
        _;
    }

    modifier notAborted(){
        require(!aborted, "Campaign aborted");
        _;
    }

    modifier notfunded(){
        require(contractFunded == false, "Already funded");
        _;
    }

    modifier minStaked() {
        require(msg.value >= minRequiredStake, "Value to low");
        _;
    }

    function depositRewards() external payable notAborted activated notfunded {
        require(msg.value > 0, "Not rewards provided");
        require(hasRole(msg.sender, serviceRole) || (msg.sender == owner), "Not enrolled as service provider");
        totalRewards += msg.value;
        rewardProvider = msg.sender;
        contractFunded = true;
        emit RewardSent(msg.sender, msg.value, block.timestamp);
    }

    function burn(uint256 _amount) public override {
        redeem(_amount);
    }

    function init(
        uint256 _signupStart,
        uint256 _signupEnd,
        uint256 _startDate,
        uint256 _endDate,
        uint256 _hardCap,
        uint256 _contributionLimit,
        uint256 _minRequiredStake
    ) external onlyOwner {
        require(!isContractInitialized, "Already initialized");//Preventing resetting by owner
        require(_contributionLimit > 0, "wrong contribution limit");
        require(_hardCap >= _contributionLimit, "Hardcap Exceeded");
        require(_signupStart < _signupEnd, "Wrong signup config");
        require(_startDate > _signupEnd, "Start febore signup period");
		endDate = _endDate;
        hardCap = _hardCap;
		startDate = _startDate;
        signupEnd = _signupEnd;
        signupStart = _signupStart;
        isContractInitialized = true;
        contributionLimit = _contributionLimit;
        minRequiredStake = _minRequiredStake;
		emit StakingPoolInitialized(block.timestamp, _startDate, _endDate);
    }

    function pause() external onlyOwner notPaused {
        isContractPaused = true;
        emit StatusChanged("contractPaused", block.timestamp);
    }

     function unPause() public onlyOwner paused {
        isContractPaused = false;
        emit StatusChanged("contractUnpaused", block.timestamp);
    }

    function deleteParameters() internal {
		delete hardCap;
        delete signupEnd;
        delete totalRewards;
        delete isContractPaused;
		delete contributionLimit;
    }

    function terminate() external onlyOwner {
        require(aborted == false , "Already terminated");
		uint256 payout = totalRewards;
        if (payout != 0){
		    payable(rewardProvider).transfer(payout);
        }
        deleteParameters();
        aborted = true;
        emit CampaignAborted(block.timestamp);
    }

    function getContractStatus() external view returns(bool _isContractInitialized, bool _isContractPaused, bool _isContractAborted){
        _isContractInitialized = isContractInitialized;
        _isContractPaused = isContractPaused;
        _isContractAborted = aborted;
    }

    function refund(uint256 _amount) internal {
        payable(msg.sender).transfer(_amount);
    }

     function stake() external payable notAborted initialized belowLimit notPaused minStaked {
        require(hasRole(msg.sender, patronRole), "No patron role");

        if ((stakes[msg.sender] + msg.value >= contributionLimit)){
            uint256 overFlow_limit = msg.value - (contributionLimit - stakes[msg.sender]);
            uint256 toMint_limit = msg.value - overFlow_limit;
            //Check if we overflow from hardCap
            if ((totalStaked + toMint_limit) >= hardCap){
                uint256 overFlow_hardCap = toMint_limit - (hardCap - totalStaked);
                uint256 finalMint = toMint_limit - overFlow_hardCap;
                
                stakes[msg.sender] += finalMint;
                _mint(msg.sender, finalMint);
                emit RefundExceeded((msg.sender), msg.value, overFlow_limit + overFlow_hardCap);
                refund(overFlow_limit + overFlow_hardCap);
                totalStaked += finalMint;
            } else {
                stakes[msg.sender] += toMint_limit;
                _mint(msg.sender, toMint_limit);
                emit RefundExceeded((msg.sender), msg.value, overFlow_limit);
                refund(overFlow_limit);
                totalStaked += toMint_limit;
            }
        } else { 
            if (totalStaked + msg.value >= hardCap){

                uint256 overFlow_hardCap = msg.value - (hardCap - totalStaked);
                uint256 finalMint = msg.value - overFlow_hardCap;
                
                stakes[msg.sender] += finalMint;
                _mint(msg.sender, finalMint);
                emit RefundExceeded((msg.sender), msg.value, overFlow_hardCap);
                refund(overFlow_hardCap);
                totalStaked += finalMint;
            } else {   
                stakes[msg.sender] += msg.value;
                _mint(msg.sender, msg.value);
                totalStaked += msg.value;
            }
        }
    }

    function getDeposit() external view returns(uint256) {
        return stakes[msg.sender];
    }

    function redeemAll() external notPaused {
        redeem(balanceOf(msg.sender));
    }
    
    function redeem(uint256 _amount) public notPaused withdrawsAllowed sufficientBalance(_amount) {
        uint256 toWithdraw = _getRewards(_amount);
        _burn(_msgSender(), _amount);
        payable(msg.sender).transfer(toWithdraw);
        emit Withdrawn(msg.sender, toWithdraw, block.timestamp);
        emit TokenBurnt(msg.sender, _amount, block.timestamp);
        totalStaked -= _amount;
        stakes[msg.sender] -= _amount;
    }

    function hasRole(address _provider, bytes32 _role) public view returns (bool){
		IClaimManager claimManager = IClaimManager(claimManagerAddress); // Contract deployed and maintained by EnergyWeb Fondation
        return (claimManager.hasRole(_provider, _role, 1));
    }

    function _getRewards(uint256 _amount) internal sufficientBalance(_amount) view returns(uint256 reward){

        // Preventing funds loss if redemption occurs before the campaign start (we don't have to pay 10% before the end of the campaign)
        if (!aborted && totalRewards != 0){ 
            uint256 interests = _amount * 1e2;
            reward = interests / 1e3 + _amount;
        } else {
            reward = _amount;
        }
        
    }

    function getRewards() external notPaused view returns (uint256){
        return _getRewards(balanceOf(msg.sender));
    }
}