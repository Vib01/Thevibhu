// Prediction variant of neural_network_maturity_AR1_table_increasing_cohort.cpp
// (original: C:/TMB_research/minimize_validation_20/) with one addition:
// the pre-sigmoid neural-net output (the logit of maturity probability) is
// exposed via ADREPORT so sdreport() can deliver a delta-method standard
// error for it. CIs are built on the logit scale (z +/- 1.96*se) and
// back-transformed with plogis(), which keeps bounds inside (0,1) even
// for cohort/age cells near the tails. Likelihood and estimates are
// otherwise identical to the original model.

#include <TMB.hpp>
#include <iostream>

template<class Type>
Type nerual_network(vector<Type> age_cohort, vector<Type> w0, matrix<Type> w1, matrix<Type> w2, Type b0, vector<Type> b1, vector<Type> b2){
  vector<Type> alpha_2 = w2*age_cohort;
  alpha_2 = 1/( 1 + exp(-alpha_2-b2) );
  vector<Type> alpha_1 = w1*alpha_2;
  alpha_1 = 1/( 1 + exp(-alpha_1-b1) );
  alpha_1 = alpha_1*w0;
  Type alpha_0 = alpha_1.sum() + b0;

  return alpha_0;
}

template<class Type>
  Type objective_function<Type>::operator() ()
{

  DATA_MATRIX(yt);
  DATA_IMATRIX(st);
  DATA_IVECTOR(birth_length);
  DATA_INTEGER(age_max);
  DATA_IVECTOR(cohort_seg);
  DATA_INTEGER(cohort_seg_num);

  PARAMETER_VECTOR(w0);
  PARAMETER_MATRIX(w1);
  PARAMETER_MATRIX(w2);
  PARAMETER(b0);
  PARAMETER_VECTOR(b1);
  PARAMETER_VECTOR(b2);
  PARAMETER(lambda);
  PARAMETER(log_sd_dev);
  PARAMETER(logit_rho_dev);
  PARAMETER_VECTOR(dev_corhort);

  int n = birth_length.size();
  Type sigma = sqrt(1/lambda/2);
  int n_nodes = b1.size();

  Type sd_dev = exp(log_sd_dev);
  Type rho_dev = 2/(1+exp(-logit_rho_dev)) - 1;

  matrix<Type> log_p_m(n,age_max);
  matrix<Type> log_1_p_m(n,age_max);
  matrix<Type> logit_p_m(n,age_max);  // pre-sigmoid NN output = logit(p_m)
  Type log_p;
  Type log_1_p;

  vector<Type> age_cohort(1+cohort_seg_num);
  age_cohort = 0;
  for(int i = 0;i < n;++i){
    age_cohort(cohort_seg(i)) = 1;
    age_cohort(0) = 0;
    log_p = nerual_network(age_cohort, w0, w1, w2, b0, b1, b2) + dev_corhort(i);
    log_1_p = -log( 1 + exp(log_p) );
    log_p_m(i,0) = log_p + log_1_p;
    log_1_p_m(i,0) = log_1_p;
    logit_p_m(i,0) = log_p;
    for(int j = 1;j < age_max;++j){
        age_cohort(0) += 1;
        log_p = nerual_network(age_cohort, w0, w1, w2, b0, b1, b2) + dev_corhort(i);
        log_1_p = -log( 1 + exp(log_p) );
        log_p_m(i,j) = log_p + log_1_p;
        log_1_p_m(i,j) = log_1_p;
        logit_p_m(i,j) = log_p;
    }
    age_cohort(cohort_seg(i)) = 0;
  }

  Type nll = 0;
  for(int i = 0;i < n;++i){
    for(int j = 0;j < birth_length(i);++j){
        nll -=  yt(i,j)*log_p_m(i,st(i,j)) + ( 1 - yt(i,j) )*log_1_p_m(i,st(i,j));
    }
  }

  nll += lambda*(w0*w0).sum();

  vector<Type> w_col(n_nodes);

  for(int i = 0;i < w1.cols();++i){
     w_col = w1.col(i);
     nll += lambda*(w_col*w_col).sum();
  }

  for(int i = 0;i < w2.cols();++i){
     w_col = w2.col(i);
     nll += lambda*(w_col*w_col).sum();
  }

  nll += lambda*(b0*b0);
  nll += lambda*(b1*b1).sum();
  nll += lambda*(b2*b2).sum();

  using namespace density;
  nll += SCALE(AR1(rho_dev),sd_dev)(dev_corhort);

  matrix<Type> p_m(n,age_max);
  p_m = exp(log_p_m.array());

  REPORT(p_m);
  REPORT(logit_p_m);
  REPORT(sd_dev);
  REPORT(rho_dev);
  REPORT(dev_corhort);

  ADREPORT(logit_p_m);

  return nll;
  }
